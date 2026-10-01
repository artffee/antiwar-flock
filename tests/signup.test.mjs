import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';

// Exercise the real handler and storage logic with an isolated in-memory Blob service.
async function setup() {
  const records = new Map();
  const state = { failRead: false, failWrite: false };
  const context = vm.createContext({ Response, Date, JSON, String, Array, RegExp });
  const blob = new vm.SyntheticModule(['get', 'put'], function () {
    this.setExport('get', async (path, options) => {
      assert.equal(options.access, 'private');
      if (state.failRead) throw new Error('Storage unavailable');
      return records.has(path) ? { stream: new Response(records.get(path)).body } : null;
    });
    this.setExport('put', async (path, value, options) => {
      assert.equal(options.access, 'private');
      if (state.failWrite) throw new Error('Storage unavailable');
      records.set(path, value);
    });
  }, { context });
  const cryptoModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', crypto); }, { context });
  const store = new vm.SourceTextModule(await readFile(new URL('../api/_lib/store.js', import.meta.url), 'utf8'), { context });
  await store.link((name) => name === 'node:crypto' ? cryptoModule : blob);
  await store.evaluate();
  const api = new vm.SourceTextModule(await readFile(new URL('../api/join.js', import.meta.url), 'utf8'), { context });
  await api.link(() => store);
  await api.evaluate();
  let sequence = 0;
  async function call(body, method = 'POST', ip = `test-${sequence++}`) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(data) { this.body = JSON.parse(JSON.stringify(data)); } };
    await api.namespace.default({ method, body, headers: { 'x-forwarded-for': ip } }, response);
    return response;
  }
  const emailRecords = () => [...records].filter(([key]) => key.startsWith('emails/')).map(([, value]) => JSON.parse(value));
  return { records, state, call, emailRecords };
}

test('availability is a private read and never writes or reveals records', async () => {
  const s = await setup();
  assert.deepEqual((await s.call(null, 'GET')).body, { available: true });
  assert.equal(s.records.size, 0);
  s.state.failRead = true;
  const failed = await s.call(null, 'GET');
  assert.equal(failed.code, 503);
  assert.deepEqual(failed.body, { available: false });
});

test('rejects invalid requests and missing consent before accessing storage', async () => {
  const s = await setup();
  for (const body of [null, '{broken', { email: 'invalid', consent: true }, { email: `${'x'.repeat(250)}@example.com`, consent: true }, { email: 'a@example.com' }, { email: 'a@example.com', consent: 'true' }, { email: 'a@example.com', consent: true, website: 'spam' }, { email: 'a@example.com', consent: true, action: 'other' }]) {
    assert.equal((await s.call(body)).code, 400);
  }
  assert.equal(s.records.size, 0);
  assert.equal((await s.call({}, 'DELETE')).code, 405);
});

test('stores explicit consent privately and treats repeated signup consistently', async () => {
  const s = await setup();
  const first = await s.call({ email: ' Artist@Example.com ', consent: true });
  const second = await s.call({ email: 'artist@example.com', consent: true });
  assert.equal(first.code, 200);
  assert.deepEqual(first.body, second.body);
  assert.deepEqual(first.body, { ok: true });
  const [record] = s.emailRecords();
  assert.equal(s.emailRecords().length, 1);
  assert.equal(record.email, 'artist@example.com');
  assert.equal(record.status, 'subscribed');
  assert.equal(record.consentVersion, '2026-10-01');
  assert.ok(record.consentAt);
  assert.ok(record.consentText.includes('product-launch'));
  assert.equal(record.emailVerified, false);
});

test('unsubscribe suppresses an existing address without exposing membership', async () => {
  const s = await setup();
  await s.call({ email: 'artist@example.com', consent: true });
  const existing = await s.call({ email: 'artist@example.com', action: 'unsubscribe' });
  const unknown = await s.call({ email: 'unknown@example.com', action: 'unsubscribe' });
  assert.deepEqual(existing.body, unknown.body);
  assert.equal(s.emailRecords().length, 1);
  assert.equal(s.emailRecords()[0].status, 'unsubscribed');
  assert.ok(s.emailRecords()[0].unsubscribedAt);
  await s.call({ email: 'artist@example.com', consent: true });
  assert.equal(s.emailRecords()[0].status, 'subscribed');
  assert.equal(s.emailRecords()[0].emailVerified, false);
});

test('storage failures never report a successful signup', async () => {
  const s = await setup();
  s.state.failWrite = true;
  assert.equal((await s.call({ email: 'artist@example.com', consent: true })).code, 503);
  assert.equal(s.emailRecords().length, 0);
  s.state.failWrite = false;
  s.state.failRead = true;
  assert.equal((await s.call({ email: 'artist@example.com', consent: true })).code, 503);
  assert.equal(s.emailRecords().length, 0);
});

test('repeated submissions from one address hit the existing rate limit', async () => {
  const s = await setup();
  for (let i = 0; i < 5; i++) assert.equal((await s.call({ email: 'artist@example.com', consent: true }, 'POST', 'same-ip')).code, 200);
  assert.equal((await s.call({ email: 'artist@example.com', consent: true }, 'POST', 'same-ip')).code, 429);
  assert.equal(s.emailRecords().length, 1);
});
