import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/email-fixture.mjs';

const campaign = { id: 'tee-launch-test', product: 'tee', title: 'Wear the noise.', message: 'A new transmission from Miami.\nIndependent minds welcome.', path: '/store' };
const admin = (s) => ({ headers: { authorization: `Bearer ${s.env.EMAIL_ADMIN_SECRET}` } });
async function preview(s, content = campaign) { return (await s.call('launch', { action: 'preview', campaign: content }, admin(s))).body; }


test('readiness separates signup and unsubscribe; disabled delivery captures nothing', async () => {
  const s = await fixture({ enabled: false });
  assert.deepEqual((await s.call('join', null, { method: 'GET' })).body, { available: false, confirmationAvailable: false, unsubscribeAvailable: true });
  assert.equal(s.records.size, 0);
  assert.equal((await s.join('artist@example.com')).code, 503);
  assert.equal(s.get('artist@example.com'), null);
  assert.equal((await s.call('join', { email: 'gone@example.com', action: 'unsubscribe' })).code, 200);
  assert.equal(s.outbox.length, 0);
  s.state.failRead = true;
  assert.equal((await s.call('join', null, { method: 'GET' })).code, 503);
});

test('invalid data, consent, honeypot, and cross-origin requests never write records', async () => {
  const s = await fixture();
  for (const body of [null, '{bad', [], { email: 'bad', consent: true }, { email: 'a@example.com' }, { email: 'a@example.com', consent: 'true' }, { email: `${'x'.repeat(250)}@example.com`, consent: true }, { email: 'a@example.com', consent: true, website: 'spam' }, { email: 'a@example.com', consent: true, interest: '__proto__' }, { email: 'a@example.com', consent: true, interest: [] }, { email: 'a@example.com', consent: true, action: 'other' }]) assert.equal((await s.call('join', body)).code, 400);
  assert.equal((await s.call('join', { email: 'a@example.com', consent: true }, { headers: { origin: 'https://attacker.example' } })).code, 400);
  assert.equal(s.records.size, 0);
  assert.equal((await s.call('join', {}, { method: 'DELETE' })).code, 405);
});

test('double opt-in requires a signed unexpired token, explicit consent and selected interests; GET is inert', async () => {
  const s = await fixture();
  assert.equal((await s.join(' Artist@Example.com ')).code, 200);
  const token = s.token();
  const stored = s.get('artist@example.com');
  assert.equal(stored.emailVerified, false); assert.ok(stored.requestConsent.text.includes('selected interests'));
  assert.ok(!JSON.stringify([...s.records.values()]).includes(token));
  assert.equal((await s.call('subscription', {}, { method: 'GET' })).code, 405);
  assert.equal(s.get('artist@example.com').emailVerified, false);
  assert.deepEqual((await s.call('subscription', { action: 'inspect', token })).body.interests, ['tee']);
  assert.equal((await s.call('subscription', { action: 'confirm', token: token + 'x', interests: ['tee'], consent: true })).code, 400);
  assert.equal((await s.call('subscription', { action: 'confirm', token, interests: ['tee'] })).code, 400);
  assert.equal((await s.call('subscription', { action: 'confirm', token, interests: ['tee'], consent: true })).code, 200);
  assert.equal(s.get('artist@example.com').emailVerified, true);
  assert.equal((await s.call('subscription', { action: 'confirm', token, interests: ['wall-art'], consent: true })).code, 400);
  assert.deepEqual(s.get('artist@example.com').verifiedInterests, ['tee']);
  s.advance(24 * 3600000 + 1);
  assert.equal((await s.call('subscription', { action: 'inspect', token })).code, 400);
});

test('repeat registration preserves legacy metadata and interests, with 60s cooldown and three emails per hour', async () => {
  const s = await fixture();
  const email = 'artist@example.com';
  s.seed(email, { email, interests: ['flying-fluck'], joinedAt: '2026-10-01', status: 'subscribed', emailVerified: false, consentAt: '2026-10-01', customField: 'preserve' });
  await s.join(email, 'tee'); const oldToken = s.token();
  await s.join(email, 'wall-art');
  assert.equal(s.outbox.length, 1);
  assert.deepEqual(s.get(email).interests, ['flying-fluck', 'tee', 'wall-art']);
  assert.equal(s.get(email).joinedAt, '2026-10-01'); assert.equal(s.get(email).customField, 'preserve'); assert.equal(s.get(email).consentAt, '2026-10-01');
  for (let i = 0; i < 4; i++) { s.advance(61000); await s.join(email, 'tee'); }
  assert.equal(s.outbox.length, 3);
  assert.equal((await s.call('subscription', { action: 'inspect', token: oldToken })).code, 400);
});

test('confirmed interests change only with mailbox authority; later public requests do not broaden eligibility', async () => {
  const s = await fixture();
  const auth = await s.confirm('artist@example.com');
  await s.join('artist@example.com', 'wall-art');
  assert.deepEqual(s.get('artist@example.com').verifiedInterests, ['tee']);
  assert.equal((await s.call('subscription', { action: 'preferences', token: auth.preferencesToken, interests: ['wall-art'] })).code, 200);
  assert.deepEqual(s.get('artist@example.com').verifiedInterests, ['wall-art']);
});

test('all unsubscribe paths preserve permanent suppression, even for unknown addresses and repeated signup', async () => {
  const s = await fixture();
  await s.confirm('artist@example.com');
  const token = s.outbox[0].payload.text.match(/#unsubscribe=([^\s]+)/)[1];
  assert.equal((await s.call('subscription', null, { query: { token }, method: 'GET' })).code, 405);
  assert.equal(s.get('artist@example.com').status, 'subscribed');
  assert.equal((await s.call('subscription', 'List-Unsubscribe=One-Click', { query: { token } })).code, 200);
  const before = s.outbox.length;
  await s.join('artist@example.com', 'wall-art');
  assert.equal(s.outbox.length, before); assert.equal(s.get('artist@example.com').status, 'unsubscribed');
  assert.deepEqual(s.get('artist@example.com').interests, ['tee']);
  await s.call('join', { action: 'unsubscribe', email: 'unknown@example.com' });
  await s.join('unknown@example.com');
  assert.equal(s.get('unknown@example.com').status, 'unsubscribed');
  assert.equal(s.outbox.length, before);
  assert.equal((await s.call('subscription', { action: 'unsubscribe', token: s.token() })).code, 400);
});

test('failed and ambiguous delivery stays pending; retry reuses the same provider idempotency key', async () => {
  const s = await fixture();
  s.state.acceptThenTimeout = true;
  assert.equal((await s.join('artist@example.com')).code, 200);
  const first = s.outbox[0];
  assert.equal(s.get('artist@example.com').emailVerified, false);
  s.advance(61000);
  assert.equal((await s.join('artist@example.com')).code, 200);
  assert.equal(s.outbox.length, 1); assert.equal(s.state.calls, 2); assert.ok(first.key.includes('confirm'));
  const f = await fixture(); f.state.providerStatus = 403;
  assert.equal((await f.join('bad@example.com')).code, 200);
  assert.equal(f.outbox.length, 0); assert.equal(f.get('bad@example.com').emailVerified, false);
});

test('storage failures fail closed without overwriting records or claiming successful unsubscribe', async () => {
  const s = await fixture(); await s.join('artist@example.com'); const before = s.get('artist@example.com');
  s.state.failRead = true;
  assert.equal((await s.join('artist@example.com')).code, 503);
  assert.deepEqual(s.get('artist@example.com'), before);
  s.state.failRead = false; s.state.failWrite = true;
  assert.equal((await s.call('join', { action: 'unsubscribe', email: 'artist@example.com' })).code, 503);
  assert.deepEqual(s.get('artist@example.com'), before);
});

test('concurrent signup merges interests; confirmation racing unsubscribe cannot reactivate the address', async () => {
  const s = await fixture();
  await s.api('join'); await s.api('subscription');
  const result = await Promise.all(['tee', 'wall-art', 'flying-fluck', 'chill-pill'].map((interest) => s.join('artist@example.com', interest)));
  assert.ok(result.every((r) => r.code === 200));
  assert.equal(s.get('artist@example.com').interests.length, 4); assert.equal(s.outbox.length, 1);
  await Promise.all([
    s.call('subscription', { action: 'confirm', token: s.token(), interests: ['tee'], consent: true }),
    s.call('join', { action: 'unsubscribe', email: 'artist@example.com' }),
  ]);
  assert.equal(s.get('artist@example.com').status, 'unsubscribed');
});

test('per-IP rate limit is enforced atomically', async () => {
  const s = await fixture();
  for (let i = 0; i < 5; i++) assert.equal((await s.call('join', { email: 'artist@example.com', consent: true }, { headers: { 'x-vercel-forwarded-for': 'same' } })).code, 200);
  assert.equal((await s.call('join', { email: 'artist@example.com', consent: true }, { headers: { 'x-vercel-forwarded-for': 'same' } })).code, 429);
});

test('launch preview filters unverified, legacy, irrelevant, and suppressed records across all listing pages', async () => {
  const s = await fixture();
  await s.confirm('tee@example.com', ['tee']); await s.confirm('all@example.com', ['all']); await s.confirm('wall@example.com', ['wall-art']);
  await s.join('pending@example.com');
  s.seed('legacy@example.com', { email: 'legacy@example.com', status: 'subscribed', emailVerified: true, interests: ['tee'] });
  await s.confirm('gone@example.com', ['tee']); await s.call('join', { email: 'gone@example.com', action: 'unsubscribe' });
  s.state.pageSize = 1;
  const p = await preview(s);
  assert.equal(p.recipientCount, 2); assert.ok(!('keys' in p));
  const count = s.outbox.length;
  assert.equal((await s.call('launch', { action: 'send', campaignId: campaign.id, approval: p.approval }, admin(s))).code, 400);
  assert.equal((await s.call('launch', { action: 'approve', campaign, ...p, approval: 'yes' }, admin(s))).code, 400);
  assert.equal(s.outbox.length, count);
  assert.equal((await s.call('launch', { action: 'preview', campaign })).code, 401);
});


test('campaign approval remains locked after audience or postal configuration changes', async () => {
  const s = await fixture(); await s.confirm('first@example.com');
  const p = await preview(s); await s.confirm('second@example.com');
  assert.equal((await s.call('launch', { ...p, action: 'approve', campaign }, admin(s))).code, 400);
  delete s.env.EMAIL_POSTAL_ADDRESS;
  assert.equal((await s.call('launch', { ...await preview(s), action: 'approve', campaign }, admin(s))).code, 400);
});


test('signed delivery events are durable and idempotent; bounces and complaints permanently suppress', async () => {
  const s = await fixture(); await s.confirm('artist@example.com');
  const delivery = s.sign({ type: 'email.delivered', data: { email_id: 'test-email', to: ['artist@example.com'] } });
  assert.equal((await s.call('email-webhook', null, delivery)).code, 200);
  assert.equal((await s.call('email-webhook', null, delivery)).code, 200);
  const late = s.sign({ type: 'email.sent', data: { email_id: 'test-email', to: ['artist@example.com'] } });
  await s.call('email-webhook', null, late);
  const ledger = [...s.records].filter(([path]) => path.startsWith('email-delivery/')).map(([, value]) => JSON.parse(value));
  assert.equal(ledger[0].status, 'email.delivered');
  const bad = { ...delivery, raw: delivery.raw + ' ' };
  assert.equal((await s.call('email-webhook', null, bad)).code, 400);
  const bounce = s.sign({ type: 'email.bounced', data: { email_id: 'bounced-id', to: ['artist@example.com'] } });
  s.state.failWrite = true;
  assert.equal((await s.call('email-webhook', null, bounce)).code, 503);
  s.state.failWrite = false;
  assert.equal((await s.call('email-webhook', null, bounce)).code, 200);
  assert.equal(s.get('artist@example.com').status, 'suppressed');
  const before = s.outbox.length; await s.join('artist@example.com'); assert.equal(s.outbox.length, before);
  const complaint = s.sign({ type: 'email.complained', data: { to: ['other@example.com'], email_id: 'spam-id' } });
  assert.equal((await s.call('email-webhook', null, complaint)).code, 200);
  assert.equal(s.get('other@example.com').suppressionReason, 'email.complained');
});

test('webhook uses exact raw bytes, and provider failures do not invent delivery or clear suppression', async () => {
  const s = await fixture();
  const signed = s.sign({ type: 'email.failed', data: { email_id: 'failed-id', to: ['artist@example.com'], message: 'Miami ↗' } });
  const buf = Buffer.from(signed.raw); const offset = buf.indexOf(Buffer.from('↗')) + 1;
  signed.raw = [buf.subarray(0, offset), buf.subarray(offset)];
  assert.equal((await s.call('email-webhook', null, signed)).code, 200);
  assert.equal(s.get('artist@example.com'), null);
  const event = s.sign({ type: 'suppression.added', data: { email: 'artist@example.com' } });
  await s.call('email-webhook', null, event);
  assert.equal(s.get('artist@example.com').status, 'suppressed');
  await s.call('email-webhook', null, s.sign({ type: 'suppression.removed', data: { email: 'artist@example.com' } }));
  assert.equal(s.get('artist@example.com').status, 'suppressed');
});
