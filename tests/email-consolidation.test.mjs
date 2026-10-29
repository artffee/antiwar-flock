import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './helpers/email-fixture.mjs';
import crypto from 'node:crypto';

const email = 'artist@example.com';
const leave = (s) => s.call('join', { action: 'unsubscribe', email });
const confirm = (s, token = s.token()) => s.call('subscription', { action: 'confirm', token, consent: true, interests: ['tee'] });

test('one-use token has exactly one winner under concurrent consumption', async () => {
  const s = await fixture(); await s.join(email); await s.api('subscription');
  const results = await Promise.all(Array.from({ length: 6 }, () => confirm(s)));
  assert.equal(results.filter((r) => r.code === 200).length, 1);
  assert.equal(results.filter((r) => r.code === 400).length, 5);
  for (const result of results.filter((r) => r.code === 400)) assert.equal(result.body.preferencesToken, undefined);
});

test('malformed, expired at boundary, wrong-purpose and used tokens are inert', async () => {
  const s = await fixture(); await s.join(email);
  const unsubscribe = s.outbox[0].payload.text.match(/#unsubscribe=([^\s]+)/)[1];
  for (const token of ['', 'x', unsubscribe, s.token() + 'x']) assert.equal((await confirm(s, token)).code, 400);
  s.advance(24 * 3600000);
  assert.equal((await confirm(s)).code, 400);
  assert.equal(s.get(email).emailVerified, false);
});

test('unsubscribe wins a forced CAS race against confirmation and invalidates the token', async () => {
  const s = await fixture(); await s.join(email);
  s.state.beforePut = async (path, value) => {
    if (path === `emails/${s.key(email)}.json` && JSON.parse(value).emailVerified) {
      s.state.beforePut = null; await leave(s);
    }
  };
  assert.equal((await confirm(s)).code, 400);
  assert.equal(s.get(email).status, 'unsubscribed');
  assert.equal(s.get(email).confirmation, null);
  assert.equal(s.get(email).emailVerified, false);
});

test('first-create AlreadyExists race and in-flight delivery never undo unsubscribe', async () => {
  const s = await fixture();
  s.state.beforePut = async (path) => {
    if (path === `emails/${s.key(email)}.json`) { s.state.beforePut = null; await leave(s); }
  };
  assert.equal((await s.join(email)).code, 200);
  assert.equal(s.get(email).status, 'unsubscribed'); assert.equal(s.outbox.length, 0);
  const t = await fixture(); t.state.afterSend = async () => { t.state.afterSend = null; await leave(t); };
  await t.join(email);
  assert.equal(t.get(email).confirmation, null);
  assert.equal((await confirm(t)).code, 400);
});

test('malformed private records and missing ETags fail closed without replacement or sending', async () => {
  for (const raw of ['null', '[]', '"text"', '42', '{bad']) {
    const s = await fixture(); const path = `emails/${s.key(email)}.json`; s.records.set(path, raw);
    assert.equal((await s.join(email)).code, 503);
    assert.equal(s.records.get(path), raw); assert.equal(s.outbox.length, 0);
  }
  const s = await fixture(); s.seed(email, { email, status: 'unsubscribed' }); s.state.missingEtag = true;
  assert.equal((await s.join(email)).code, 503); assert.equal(s.get(email).status, 'unsubscribed');
});

test('legacy fields and both PR record formats survive; historical interests never become confirmed preferences', async () => {
  const s = await fixture();
  s.seed(email, { email, status: 'subscribed', emailVerified: false, joinedAt: '2025-01-01',
    consentAt: '2026-10-01', consentVersion: 'old', consentText: 'old text',
    interests: ['drama-dump'], consentHistory: [{ consentAt: 'earlier' }], customAudit: 'preserve',
    unsubscribeNonce: 'old-pr2-nonce', confirmation: { nonce: 'old', tokenHash: 'old', expiresAt: 1 } });
  await s.call('join', null, { method: 'GET' });
  assert.equal(s.outbox.length, 0); assert.equal(s.get(email).confirmation.nonce, 'old');
  await s.join(email);
  assert.deepEqual((await s.call('subscription', { action: 'inspect', token: s.token() })).body.interests, ['tee']);
  assert.equal((await confirm(s)).code, 200);
  const record = s.get(email);
  assert.equal(record.consentText, 'old text'); assert.equal(record.joinedAt, '2025-01-01');
  assert.equal(record.customAudit, 'preserve'); assert.equal(record.unsubscribeNonce, 'old-pr2-nonce');
  assert.deepEqual(record.interests, ['drama-dump', 'tee']);
  assert.deepEqual(record.verifiedInterests, ['tee']);
  assert.equal(record.consentHistory[0].consentAt, 'earlier');
});

test('existing suppression flags from either implementation remain permanent', async () => {
  for (const protection of [{ status: 'bounced' }, { status: 'complained' }, { status: 'suppressed' },
    { status: 'unsubscribed' }, { unsubscribed: true }, { suppressedAt: 'old' }, { suppressionReason: 'manual' }, { unsubscribedAt: 'old' }]) {
    const s = await fixture(); s.seed(email, { email, interests: ['all'], customAudit: 'keep', ...protection });
    await s.join(email); await leave(s); s.advance(61000); await s.join(email);
    assert.equal(s.outbox.length, 0); assert.equal(s.get(email).status, 'unsubscribed');
    assert.equal(s.get(email).customAudit, 'keep');
    if (['bounced', 'complained', 'suppressed'].includes(protection.status)) assert.equal(s.get(email).suppressionReason, protection.status);
  }
});

test('consent history records authorized preference changes without erasing original consent', async () => {
  const s = await fixture(); const auth = await s.confirm(email);
  const before = s.get(email); s.advance(1000);
  await s.call('subscription', { action: 'preferences', token: auth.preferencesToken, interests: ['wall-art'] });
  const record = s.get(email);
  assert.equal(record.consentAt, before.consentAt);
  assert.equal(record.consentHistory.at(-1).consentAt, before.confirmedConsentAt);
  assert.deepEqual(record.consentHistory.at(-1).interests, ['tee']);
  await leave(s);
  assert.equal((await s.call('subscription', { action: 'preferences', token: auth.preferencesToken, interests: ['all'] })).code, 400);
});

test('provider rejection, timeout, cooldown, confirmed and suppressed responses cannot enumerate membership', async () => {
  const s = await fixture(); await s.confirm('confirmed@example.com'); await leave(s);
  s.state.providerStatus = 403;
  const responses = [];
  for (const address of ['new@example.com', 'confirmed@example.com', email, 'new@example.com']) responses.push((await s.join(address)).body);
  assert.ok(responses.every((r) => JSON.stringify(r) === JSON.stringify(responses[0])));
  assert.deepEqual(responses[0], { ok: true, confirmationAvailable: true });
});

test('atomic IP limit permits five concurrent requests and cannot block the unsubscribe bucket', async () => {
  const s = await fixture(); await s.api('join');
  const options = { headers: { 'x-vercel-forwarded-for': 'same-ip' } };
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => s.call('join', { email: `a${i}@example.com`, consent: true }, options)));
  assert.equal(results.filter((r) => r.code === 200).length, 5);
  assert.equal(results.filter((r) => r.code === 429).length, 3);
  assert.equal((await s.call('join', { email, action: 'unsubscribe' }, options)).code, 200);
});

test('Preview rejects inherited production credentials, including a different key for the same store', async () => {
  const s = await fixture(); s.env.VERCEL_ENV = 'preview';
  s.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_Production_Secret';
  s.env.EMAIL_SITE_URL = 'https://preview.example.com'; s.env.EMAIL_DELIVERY_MODE = 'test';
  assert.equal((await s.call('join', null, { method: 'GET' })).code, 503);
  assert.equal(s.state.lastStorageOptions, undefined);
  s.env.EMAIL_PREVIEW_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_Production_DifferentSecret';
  assert.equal((await s.call('join', null, { method: 'GET' })).code, 503);
  s.env.EMAIL_PREVIEW_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_Isolated_Secret';
  assert.equal((await s.call('join', null, { method: 'GET' })).body.available, true);
  assert.equal(s.state.lastStorageOptions.token, s.env.EMAIL_PREVIEW_BLOB_READ_WRITE_TOKEN);
  s.env.EMAIL_DELIVERY_MODE = 'live';
  assert.equal((await s.call('join', null, { method: 'GET' })).body.available, false);
});

test('test mode only sends to designated inboxes and links use the configured isolated origin', async () => {
  const s = await fixture(); s.env.EMAIL_DELIVERY_MODE = 'test'; s.env.EMAIL_SITE_URL = 'https://preview.example.com';
  await s.join(email); assert.equal(s.outbox.length, 0); assert.equal(s.get(email), null);
  await s.join('owner@example.com'); assert.equal(s.outbox.length, 1);
  assert.ok(s.outbox[0].payload.text.includes('https://preview.example.com/email#confirm='));
  s.env.EMAIL_SITE_URL = 'https://preview.example.com/path';
  assert.equal((await s.call('join', null, { method: 'GET' })).body.available, false);
});

test('campaign mutations are code-locked even with every old activation flag set', async () => {
  const s = await fixture(); await s.confirm(email);
  const headers = { headers: { authorization: `Bearer ${s.env.EMAIL_ADMIN_SECRET}` } };
  const campaign = { id: 'test-launch', product: 'tee', title: 'Test', message: 'Test', path: '/store' };
  const preview = await s.call('launch', { action: 'preview', campaign }, headers);
  assert.equal(preview.code, 200); assert.equal(preview.body.recipientCount, 1); assert.equal(preview.body.sendingConfigured, false);
  const before = s.outbox.length;
  for (const action of ['approve', 'send', 'test']) {
    assert.equal((await s.call('launch', { ...preview.body, action, campaign, campaignId: campaign.id, email: 'owner@example.com' }, headers)).code, 400);
  }
  assert.equal(s.outbox.length, before);
  assert.ok(![...s.records.keys()].some((path) => path.startsWith('email-campaigns/')));
});

test('signup analytics and confirmation page never expose identifiers to tracking', async () => {
  const html = await readFile(new URL('../email.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('analytics')); assert.ok(html.includes('no-referrer'));
  const analytics = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');
  assert.ok(analytics.includes('signup|email|confirm'));
  const js = await readFile(new URL('../email.js', import.meta.url), 'utf8');
  assert.ok(js.includes('history.replaceState'));
});

test('PR #2 unsubscribe links remain usable with the original secret; confirmation tokens cannot opt in or opt out', async () => {
  const s = await fixture(); s.env.A305X_TOKEN_SECRET = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url'); const key = s.key(email);
  s.seed(email, { email, status: 'subscribed', unsubscribeNonce: nonce, customAudit: 'preserve' });
  const token = (purpose) => `${key}.${nonce}.${crypto.createHmac('sha256', s.env.A305X_TOKEN_SECRET).update(`${purpose}:${key}:${nonce}`).digest('base64url')}`;
  assert.equal((await confirm(s, token('confirm'))).code, 400);
  assert.equal((await s.call('subscription', { action: 'unsubscribe', token: token('confirm') })).code, 400);
  s.env.EMAIL_ENABLED = 'false';
  for (let i = 0; i < 2; i++) assert.equal((await s.call('subscription', { action: 'unsubscribe', token: token('unsubscribe') })).code, 200);
  assert.equal(s.get(email).status, 'unsubscribed'); assert.equal(s.get(email).customAudit, 'preserve');
});

test('provider acceptance followed by a lost journal update recovers the same request after its lease', async () => {
  const s = await fixture();
  s.state.afterSend = async () => { s.state.afterSend = null; s.state.failWrite = true; };
  assert.equal((await s.join(email)).code, 503);
  assert.equal(s.outbox.length, 1); const token = s.token();
  s.state.failWrite = false; s.advance(121000);
  assert.equal((await s.join(email)).code, 200);
  assert.equal(s.outbox.length, 1); assert.equal(s.token(), token);
  assert.equal(s.get(email).confirmation.lastSendState, 'sent');
  assert.equal((await confirm(s, token)).code, 200);
});

test('JSON-only requests reject cross-site metadata and client-supplied forwarding cannot evade rate limits', async () => {
  const s = await fixture(); const body = { email, consent: true };
  for (const headers of [{ 'content-type': 'text/plain' }, { 'sec-fetch-site': 'cross-site' }, { 'content-length': '4097' }]) {
    assert.equal((await s.call('join', body, { headers })).code, 400);
  }
  assert.equal(s.records.size, 0);
  for (let i = 0; i < 5; i++) assert.equal((await s.call('join', body, { headers: { 'x-vercel-forwarded-for': 'real-ip', 'x-forwarded-for': `fake-${i}` } })).code, 200);
  assert.equal((await s.call('join', body, { headers: { 'x-vercel-forwarded-for': 'real-ip', 'x-forwarded-for': 'another-fake' } })).code, 429);
});

test('confirmed subscribers can recover preference access with fresh proof after losing their session', async () => {
  const s = await fixture(); await s.confirm(email, ['all']); const oldToken = s.token();
  s.advance(61000); await s.join(email, 'all');
  assert.equal(s.outbox.length, 2); assert.notEqual(s.token(), oldToken);
  assert.equal((await confirm(s, oldToken)).code, 400);
  assert.equal((await confirm(s)).code, 200);
  assert.deepEqual(s.get(email).verifiedInterests, ['tee']);
});
