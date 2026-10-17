import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { Webhook } from 'svix';

export async function fixture({ enabled = true } = {}) {
  const records = new Map();
  const versions = new Map();
  const outbox = [];
  const accepted = new Map();
  const state = { now: Date.now(), failRead: false, failWrite: false, providerStatus: 200, pageSize: 1000, calls: 0 };
  const env = {
    EMAIL_ENABLED: String(enabled), EMAIL_MARKETING_ENABLED: 'true',
    EMAIL_FROM: 'A305X <updates@a305x.com>', EMAIL_TOKEN_SECRET: 'test-token-secret-never-use-in-production-305',
    RESEND_API_KEY: 'test-key', RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from('test-webhook-secret-305305305305').toString('base64')}`,
    EMAIL_ADMIN_SECRET: 'test-admin-secret-never-use-in-production-305',
    EMAIL_POSTAL_ADDRESS: 'TEST FIXTURE ADDRESS — NOT FOR PRODUCTION', EMAIL_TEST_RECIPIENTS: 'owner@example.com',
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  class Conflict extends Error {}
  const context = vm.createContext({ Response, AbortSignal, Buffer, Date: Clock, URL, URLSearchParams, JSON, String, Array, Object, RegExp, Set, Math, Number, process: { env },
    fetch: async (url, options) => {
      if (url !== 'https://api.resend.com/emails') throw new Error('Unexpected network request');
      state.calls++;
      const payload = JSON.parse(options.body);
      const key = options.headers['Idempotency-Key'];
      if (accepted.has(key)) return new Response(JSON.stringify({ id: accepted.get(key) }), { status: 200 });
      if (state.providerStatus !== 200) return new Response('{}', { status: state.providerStatus });
      const id = `email-${outbox.length + 1}`;
      accepted.set(key, id);
      outbox.push({ payload, key, id, headers: options.headers });
      if (state.acceptThenTimeout) { state.acceptThenTimeout = false; throw new Error('Timeout after acceptance'); }
      return new Response(JSON.stringify({ id }), { status: 200 });
    },
  });
  const blob = new vm.SyntheticModule(['get', 'put', 'list', 'BlobPreconditionFailedError'], function () {
    this.setExport('BlobPreconditionFailedError', Conflict);
    this.setExport('get', async (path, options) => {
      if (options.access !== 'private') throw new Error('Expected private storage');
      if (state.failRead) throw new Error('Storage unavailable');
      return records.has(path) ? { stream: new Response(records.get(path)).body, blob: { etag: String(versions.get(path) || 1) } } : null;
    });
    this.setExport('put', async (path, value, options) => {
      if (options.access !== 'private') throw new Error('Expected private storage');
      if (state.failWrite) throw new Error('Storage unavailable');
      if (options.ifMatch && options.ifMatch !== String(versions.get(path) || 1)) throw new Conflict();
      if (options.allowOverwrite === false && records.has(path)) throw new Conflict();
      records.set(path, value); versions.set(path, (versions.get(path) || 1) + 1);
      return { pathname: path, etag: String(versions.get(path)) };
    });
    this.setExport('list', async ({ prefix, cursor }) => {
      if (state.failRead) throw new Error('Storage unavailable');
      const items = [...records.keys()].filter((p) => p.startsWith(prefix)).sort();
      const start = Number(cursor || 0); const end = start + state.pageSize;
      return { blobs: items.slice(start, end).map((pathname) => ({ pathname })), hasMore: items.length > end, cursor: String(end) };
    });
  }, { context });
  const modules = new Map();
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const cryptoModule = synthetic({ default: crypto });
  const svixModule = synthetic({ Webhook });
  async function module(url) {
    const key = url.href;
    if (modules.has(key)) return modules.get(key);
    const mod = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: key });
    modules.set(key, mod);
    await mod.link(async (name, parent) => name === 'node:crypto' ? cryptoModule : name === '@vercel/blob' ? blob : name === 'svix' ? svixModule : module(new URL(name, parent.identifier)));
    return mod;
  }
  async function api(name) {
    const mod = await module(new URL(`../../api/${name}.js`, import.meta.url));
    if (mod.status !== 'evaluated') await mod.evaluate();
    return mod.namespace;
  }
  let sequence = 0;
  async function call(name, body, options = {}) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; } };
    const req = { body, method: options.method || 'POST', query: options.query || {}, headers: { host: 'www.a305x.com', 'x-forwarded-for': `test-${sequence++}`, ...options.headers } };
    if (options.raw !== undefined) req[Symbol.asyncIterator] = async function* () { for (const chunk of (Array.isArray(options.raw) ? options.raw : [options.raw])) yield chunk; };
    await (await api(name)).default(req, response);
    return response;
  }
  const key = (email) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const read = (path) => records.has(path) ? JSON.parse(records.get(path)) : null;
  const get = (email) => read(`emails/${key(email)}.json`);
  const seed = (email, record) => records.set(`emails/${key(email)}.json`, JSON.stringify(record));
  const sign = (event, id = crypto.randomUUID(), raw) => {
    const payload = raw || JSON.stringify(event);
    const timestamp = new Date();
    return { raw: payload, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(+timestamp / 1000)), 'svix-signature': new Webhook(env.RESEND_WEBHOOK_SECRET).sign(id, timestamp, payload) } };
  };
  const token = (index = outbox.length - 1) => outbox[index].payload.text.match(/#confirm=([^\s]+)/)?.[1];
  async function join(email, interest = 'tee') { return call('join', { email, interest, consent: true }); }
  async function confirm(email, interests = ['tee']) {
    await join(email, interests[0]);
    const response = await call('subscription', { action: 'confirm', token: token(), interests, consent: true });
    if (response.code !== 200) throw new Error(JSON.stringify(response));
    return response.body;
  }
  return { records, state, env, outbox, call, api, key, read, get, seed, sign, token, join, confirm, advance: (ms) => { state.now += ms; } };
}
