import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';

// The real routes and modules run against isolated CAS storage and a provider fake.
// No production records or real inboxes are touched by this suite.
async function setup() {
  const records = new Map(), versions = new Map(), sent = [];
  const state = { failRead: false, failWrite: false, providerStatus: 200, providerThrow: false, beforePut: null, afterSend: null, now: 1800000000000 };
  const env = { EMAIL_CONFIRMATION_ENABLED: 'true', A305X_TOKEN_SECRET: 'a'.repeat(43), RESEND_API_KEY: 'test-only', A305X_EMAIL_FROM: 'updates@example.com', A305X_EMAIL_REPLY_TO: 'support@example.com', A305X_SITE_URL: 'https://www.example.com' };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  class BlobPreconditionFailedError extends Error {}
  const context = vm.createContext({ Response, URL, AbortSignal, Buffer, Date: Clock, JSON, String, Array, RegExp, process: { env }, setTimeout: (fn) => setTimeout(fn, 0), fetch: async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const message = { payload: JSON.parse(options.body), key: options.headers['Idempotency-Key'] };
    sent.push(message);
    if (state.afterSend) await state.afterSend();
    if (state.providerThrow) throw new Error('Network timeout');
    return new Response(JSON.stringify(state.providerStatus === 200 ? { id: 'message-test-id' } : { message: 'provider unavailable' }), { status: state.providerStatus });
  } });
  const blob = new vm.SyntheticModule(['get', 'put', 'BlobPreconditionFailedError'], function () {
    this.setExport('BlobPreconditionFailedError', BlobPreconditionFailedError);
    this.setExport('get', async (path, options) => {
      assert.equal(options.access, 'private');
      assert.equal(options.useCache, false);
      if (state.failRead) throw new Error('Storage unavailable');
      return records.has(path) ? { stream: new Response(records.get(path)).body, blob: { etag: String(versions.get(path) || 0) } } : null;
    });
    this.setExport('put', async (path, value, options) => {
      assert.equal(options.access, 'private');
      if (state.failWrite) throw new Error('Storage unavailable');
      if (state.beforePut) await state.beforePut(path, value);
      if (options.ifMatch !== undefined && options.ifMatch !== String(versions.get(path) || 0)) throw new BlobPreconditionFailedError();
      if (!options.allowOverwrite && records.has(path)) throw new BlobPreconditionFailedError();
      records.set(path, value); versions.set(path, (versions.get(path) || 0) + 1);
    });
  }, { context });
  const cryptoModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', crypto); }, { context });
  const modules = new Map();
  const root = new URL('../api/', import.meta.url);
  // Preload to support the intentional store/subscriptions re-export cycle.
  for (const path of ['join.js', 'confirm.js', '_lib/store.js', '_lib/email.js', '_lib/subscriptions.js', '_lib/request.js']) {
    const url = new URL(path, root).href;
    modules.set(url, new vm.SourceTextModule(await readFile(new URL(url), 'utf8'), { context, identifier: url }));
  }
  const linker = (name, parent) => name === 'node:crypto' ? cryptoModule : name === '@vercel/blob' ? blob : modules.get(new URL(name, parent.identifier).href);
  const join = modules.get(new URL('join.js', root).href), confirm = modules.get(new URL('confirm.js', root).href);
  await join.link(linker); await join.evaluate();
  await confirm.link(linker); await confirm.evaluate();
  let sequence = 0;
  async function call(body, method = 'POST', ip = `test-${sequence++}`, route = 'join', headers = {}) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(data) { this.body = JSON.parse(JSON.stringify(data)); return this; } };
    await (route === 'join' ? join : confirm).namespace.default({ method, body, headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip, ...headers } }, response);
    return response;
  }
  const path = (email = 'artist@example.com') => `emails/${crypto.createHash('sha256').update(email).digest('hex')}.json`;
  const record = (email) => records.has(path(email)) ? JSON.parse(records.get(path(email))) : null;
  const seed = (data, email = 'artist@example.com') => { records.set(path(email), JSON.stringify({ email, ...data })); versions.set(path(email), (versions.get(path(email)) || 0) + 1); };
  const token = (index = sent.length - 1, unsubscribe = false) => {
    const links = sent[index].payload.text.match(/https:\/\/[^\s]+/g);
    return new URL(links[unsubscribe ? 1 : 0]).hash.match(/token=([^&]+)/)[1];
  };
  const subscription = modules.get(new URL('_lib/subscriptions.js', root).href).namespace;
  return { records, versions, state, env, sent, call, record, seed, token, path, subscription, advance: (ms = 61000) => { state.now += ms; } };
}
const signup = (interest = 'tee', email = 'artist@example.com') => ({ email, consent: true, interest });
const verify = (s, token = s.token()) => s.call({ token, action: 'confirm' }, 'POST', undefined, 'confirm');
const leave = (s) => s.call({ email: 'artist@example.com', action: 'unsubscribe' });

test('readiness makes no writes; disabling email preserves unsubscribe', async () => {
  const s = await setup();
  assert.deepEqual((await s.call(null, 'GET')).body, { available: true, unsubscribeAvailable: true });
  assert.equal(s.records.size, 0);
  delete s.env.RESEND_API_KEY;
  assert.deepEqual((await s.call(null, 'GET')).body, { available: false, unsubscribeAvailable: true });
  assert.equal((await s.call(signup())).code, 503);
  assert.equal((await leave(s)).code, 200);
  s.state.failRead = true;
  assert.deepEqual((await s.call(null, 'GET')).body, { available: false, unsubscribeAvailable: false });
});

test('invalid bodies, consent, interests, content types and cross-site requests fail before writes', async () => {
  const s = await setup();
  for (const body of [null, [], 'null', '{broken', { email: 'bad', consent: true }, signup('private'), signup([]), signup({}, 'a@example.com'), { email: 'a@example.com' }, { email: 'a@example.com', consent: 'true' }, { ...signup(), website: 'spam' }, { ...signup(), action: 'other' }, signup('tee', `${'x'.repeat(250)}@example.com`), signup('tee', 'a\n@example.com')]) assert.equal((await s.call(body)).code, 400);
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-length': '10000' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await s.call(signup(), 'POST', undefined, 'join', headers)).code, 400);
  assert.equal(s.records.size, 0);
  assert.equal((await s.call({}, 'DELETE')).code, 405);
});

test('new signup stays pending; hashes only; explicit POST consumes token once', async () => {
  const s = await setup();
  assert.deepEqual((await s.call(signup('tee', ' Artist@Example.com '))).body, { ok: true });
  const pending = s.record();
  assert.equal(pending.status, 'pending');
  assert.equal(pending.emailVerified, false);
  assert.equal(s.subscription.canReceiveMarketing(pending), false);
  assert.equal(pending.confirmation.consentVersion, '2026-10-24');
  assert.deepEqual(pending.confirmation.interests, ['tee']);
  assert.equal(pending.confirmation.delivery, 'accepted');
  assert.equal(pending.confirmation.providerId, 'message-test-id');
  assert.equal(JSON.stringify([...s.records]).includes(s.token()), false);
  assert.equal((await s.call({ token: s.token(), action: 'confirm' }, 'GET', undefined, 'confirm')).code, 405);
  assert.equal(s.record().emailVerified, false);
  assert.equal((await verify(s)).code, 200);
  assert.equal(s.record().emailVerified, true);
  assert.equal(s.subscription.canReceiveMarketing(s.record()), true);
  assert.equal(s.record().confirmation, null);
  assert.deepEqual(s.record().interests, ['tee']);
  assert.equal((await verify(s)).code, 400);
});

test('repeat responses do not expose membership, provider rejection or suppression; cooldown avoids duplicate sends', async () => {
  const s = await setup();
  const first = await s.call(signup());
  assert.deepEqual((await s.call(signup())).body, first.body);
  assert.equal(s.sent.length, 1);
  s.seed({ status: 'suppressed', suppressedAt: '2026-10-01', emailVerified: false }, 'blocked@example.com');
  assert.deepEqual((await s.call(signup('tee', 'blocked@example.com'))).body, first.body);
  assert.equal(s.sent.length, 1);
  s.state.providerStatus = 403;
  assert.deepEqual((await s.call(signup('tee', 'new@example.com'))).body, first.body);
  assert.equal(s.record('new@example.com').confirmation.delivery, 'pending');
});

test('pending preference changes require a new confirmation; old tokens are invalidated', async () => {
  const s = await setup();
  await s.call(signup()); const old = s.token();
  s.advance(); await s.call(signup('wall-art'));
  assert.equal((await verify(s, old)).code, 400);
  assert.equal((await verify(s)).code, 200);
  assert.deepEqual(s.record().interests, ['tee', 'wall-art']);
  const originalConsent = s.record().consentAt;
  s.advance(); await s.call(signup('flying-fluck'));
  assert.equal(s.subscription.canReceiveMarketing(s.record()), true);
  assert.deepEqual(s.record().interests, ['tee', 'wall-art']);
  await verify(s);
  assert.deepEqual(s.record().interests, ['tee', 'wall-art', 'flying-fluck']);
  assert.equal(s.record().consentHistory[0].consentAt, originalConsent);
});

test('legacy records and unknown fields are preserved, never automatically confirmed', async () => {
  const s = await setup();
  s.seed({ status: 'subscribed', emailVerified: false, consentAt: '2026-10-01', consentVersion: '2026-10-01', consentText: 'old text', interests: ['drama-dump'], joinedAt: '2025-01-01', customAudit: 'keep' });
  await s.call(signup());
  assert.equal(s.record().consentAt, '2026-10-01');
  assert.equal(s.record().emailVerified, false);
  assert.equal(s.subscription.canReceiveMarketing(s.record()), false);
  await verify(s);
  assert.equal(s.record().joinedAt, '2025-01-01');
  assert.equal(s.record().customAudit, 'keep');
  assert.equal(s.record().consentHistory[0].consentText, 'old text');
  assert.deepEqual(s.record().interests, ['drama-dump', 'tee']);
  assert.equal(s.subscription.canReceiveMarketing({ status: 'subscribed', emailVerified: true, consentAt: 'old' }), false);
});

test('expired, malformed, wrong-purpose, altered and used tokens never verify', async () => {
  const s = await setup(); await s.call(signup());
  for (const token of ['', 'x', s.token().slice(0, -1) + (s.token().endsWith('x') ? 'z' : 'x'), s.token(0, true)]) assert.equal((await verify(s, token)).code, 400);
  s.advance(24 * 3600000);
  assert.equal((await verify(s)).code, 400);
  assert.equal(s.record().emailVerified, false);
  await s.call(signup()); assert.equal((await verify(s)).code, 200);
});

test('unsubscribe cancels confirmation; repeated and unknown unsubscribe responses match; rejoin needs fresh proof', async () => {
  const s = await setup(); await s.call(signup()); const old = s.token();
  const original = await leave(s);
  assert.deepEqual((await s.call({ email: 'unknown@example.com', action: 'unsubscribe' })).body, original.body);
  assert.equal(s.record('unknown@example.com').status, 'unsubscribed');
  assert.equal(s.record().confirmation, null);
  assert.equal((await verify(s, old)).code, 400);
  assert.deepEqual((await leave(s)).body, original.body);
  s.advance(); await s.call(signup());
  assert.equal(s.record().status, 'unsubscribed');
  assert.equal(s.subscription.canReceiveMarketing(s.record()), false);
  await verify(s);
  assert.equal(s.subscription.canReceiveMarketing(s.record()), true);
  assert.ok(s.record().unsubscribedAt);
});

test('email unsubscribe link works idempotently even with sending disabled', async () => {
  const s = await setup(); await s.call(signup()); await verify(s);
  const token = s.token(0, true); s.env.EMAIL_CONFIRMATION_ENABLED = 'false';
  for (let i = 0; i < 2; i++) assert.equal((await s.call({ token, action: 'unsubscribe' }, 'POST', undefined, 'confirm')).code, 200);
  assert.equal(s.record().status, 'unsubscribed');
  assert.equal(s.subscription.canReceiveMarketing(s.record()), false);
});

test('provider timeout retries exact payload and idempotency key; next request recovers acceptance', async () => {
  const s = await setup(); s.state.providerThrow = true;
  await s.call(signup());
  assert.equal(s.sent.length, 2);
  assert.deepEqual(s.sent[0], s.sent[1]);
  assert.equal(s.record().confirmation.delivery, 'pending');
  s.advance(); s.state.providerThrow = false;
  await s.call(signup());
  assert.deepEqual(s.sent[0], s.sent[2]);
  assert.equal(s.record().confirmation.delivery, 'accepted');
  await verify(s); assert.equal(s.subscription.canReceiveMarketing(s.record()), true);
});

test('storage errors fail closed without destroying suppression or sending', async () => {
  const s = await setup(); s.seed({ status: 'unsubscribed', emailVerified: false });
  const original = JSON.stringify(s.record());
  s.state.failRead = true;
  assert.equal((await s.call(signup())).code, 503);
  s.state.failRead = false; s.state.failWrite = true;
  assert.equal((await s.call(signup())).code, 503);
  assert.equal(JSON.stringify(s.record()), original);
  assert.equal(s.sent.length, 0);
});

test('IP and address limits are atomic; address cooldown is private', async () => {
  const s = await setup();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => s.call(signup('tee', `test${i}@example.com`), 'POST', 'same-ip')));
  assert.equal(results.filter((r) => r.code === 200).length, 5);
  assert.equal(results.filter((r) => r.code === 429).length, 3);
  const t = await setup();
  for (let i = 0; i < 4; i++) { assert.equal((await t.call(signup())).code, 200); t.advance(); }
  assert.equal(t.sent.length, 3);
});

test('concurrent signup and token consumption produce one send and one confirmation', async () => {
  const s = await setup();
  await Promise.all(Array.from({ length: 6 }, () => s.call(signup())));
  assert.equal(s.sent.length, 1);
  const results = await Promise.all(Array.from({ length: 6 }, () => verify(s)));
  assert.equal(results.filter((r) => r.code === 200).length, 1);
  assert.equal(results.filter((r) => r.code === 400).length, 5);
});

test('unsubscribe racing confirmation wins and an in-flight send cannot restore the pending token', async () => {
  const s = await setup(); await s.call(signup());
  const token = s.token();
  s.state.beforePut = async (path, value) => {
    if (path === s.path() && JSON.parse(value).emailVerified === true) {
      s.state.beforePut = null;
      await leave(s);
    }
  };
  assert.equal((await verify(s, token)).code, 400);
  assert.equal(s.record().status, 'unsubscribed');
  s.advance(); s.state.afterSend = async () => { s.state.afterSend = null; await leave(s); };
  await s.call(signup());
  assert.equal(s.record().confirmation, null);
  assert.equal((await verify(s)).code, 400);
});

test('unsubscribe racing first signup is not overwritten on CAS retry', async () => {
  const s = await setup();
  s.state.beforePut = async (path) => {
    if (path === s.path()) { s.state.beforePut = null; await leave(s); }
  };
  await s.call(signup());
  assert.equal(s.record().status, 'unsubscribed');
  assert.equal(s.record().confirmation, null);
  assert.equal(s.sent.length, 0);
});

test('existing bounce and complaint suppressions cannot be cleared by signup or confirmation', async () => {
  for (const status of ['bounced', 'complained', 'suppressed']) {
    const s = await setup(); s.seed({ status, interests: ['all'] });
    await s.call(signup()); assert.equal(s.sent.length, 0);
    await leave(s); s.advance(); await s.call(signup());
    assert.equal(s.record().suppressionReason, status);
    assert.equal(s.sent.length, 0);
  }
});

test('confirmation page never loads analytics or submits on page load; security headers are set', async () => {
  const html = await readFile(new URL('../confirm.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../confirm.js', import.meta.url), 'utf8');
  assert.ok(!html.includes('analytics'));
  assert.ok(html.includes('no-referrer'));
  assert.ok(js.indexOf("button.addEventListener('click'") < js.indexOf("fetch('/api/confirm'"));
  assert.ok(js.includes('history.replaceState'));
  const s = await setup(); const r = await s.call(null, 'GET');
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.equal(r.headers['Referrer-Policy'], 'no-referrer');
});
