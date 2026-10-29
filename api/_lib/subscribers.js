import crypto from 'node:crypto';
import { mutatePrivate, readPrivate } from './private-store.js';
import { CONSENT_VERSION, CONSENT_TEXT, INTERESTS, hash, emailKey, parseToken, tokenFor, linksFor, subscriberPath, validInterests, equal } from './email-tokens.js';
import { emailReady, deliverOnce, recipientAllowed } from './email-provider.js';
import { siteOrigin } from './email-config.js';
import { confirmationEmail } from './email-templates.js';

export function blocked(record) {
  return !!record && (!!record.unsubscribedAt || !!record.suppressedAt || !!record.suppressionReason || record.unsubscribed === true || ['unsubscribed', 'suppressed', 'bounced', 'complained'].includes(record.status));
}
export function confirmed(record) {
  return !!record && !blocked(record) && record.status === 'subscribed' && record.emailVerified === true &&
    [CONSENT_VERSION, '2026-10-16'].includes(record.confirmedConsentVersion) && !!record.confirmedAt && !!record.confirmedConsentAt && validInterests(record.verifiedInterests);
}
function consentHistory(record) {
  return [...(record?.consentHistory || []), ...(record?.confirmedConsentAt ? [{
    consentAt: record.confirmedConsentAt, consentVersion: record.confirmedConsentVersion,
    consentText: record.confirmedConsentText, interests: record.verifiedInterests,
  }] : [])];
}
export function matchesProduct(record, product) {
  return confirmed(record) && (record.verifiedInterests.includes('all') || record.verifiedInterests.includes(product));
}
export async function subscriber(key) {
  return (await readPrivate(subscriberPath(key))).value;
}

export async function register(email, interest) {
  const normalized = email.trim().toLowerCase();
  const key = emailKey(normalized);
  const requestId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const ready = emailReady();
  if (!ready || !recipientAllowed(normalized)) return { confirmationAvailable: ready };
  const record = await mutatePrivate(subscriberPath(key), (old) => {
    if (blocked(old)) return;
    const interests = [...new Set([...(Array.isArray(old?.interests) ? old.interests : []), interest])];
    const base = { ...old, email: normalized, joinedAt: old?.joinedAt || new Date(now).toISOString(),
      status: confirmed(old) ? 'subscribed' : 'pending', emailVerified: confirmed(old),
      interests, consentAt: old?.consentAt || new Date(now).toISOString(),
      consentVersion: old?.consentVersion || CONSENT_VERSION, consentText: old?.consentText || CONSENT_TEXT,
      source: old?.source || '/signup', preferencesUpdatedAt: new Date(now).toISOString(),
      requestConsent: { at: new Date(now).toISOString(), version: CONSENT_VERSION, text: CONSENT_TEXT, source: '/signup' } };
    // A fresh explicit signup can recover mailbox-authorized preference access,
    // even for an already-confirmed topic. Cooldown and hourly limits still apply.
    const requests = (old?.confirmationRequests || []).filter((time) => now - time < 3600000);
    if (requests.length >= 3 || now - (requests.at(-1) || 0) < 60000) return base;
    const attempt = old?.confirmation && !old.confirmation.usedAt && [undefined, 'retryable', 'sending'].includes(old.confirmation.lastSendState) && old.confirmation.expiresAt > now && now - old.confirmation.createdAt < 23 * 3600000
      ? old.confirmation.id : requestId;
    const token = tokenFor('c', key, attempt);
    return { ...base, confirmationRequests: [...requests, now], confirmation: {
      id: attempt, requestId, tokenHash: hash(token), createdAt: attempt === old?.confirmation?.id ? old.confirmation.createdAt : now,
      expiresAt: attempt === old?.confirmation?.id ? old.confirmation.expiresAt : now + 24 * 3600000,
      requestedInterests: attempt === old?.confirmation?.id ? old.confirmation.requestedInterests : [...new Set([...(confirmed(old) ? old.verifiedInterests : []), interest])],
    } };
  });
  if (!ready || blocked(record) || record?.confirmation?.requestId !== requestId) return { confirmationAvailable: ready };
  const attempt = record.confirmation.id;
  const token = tokenFor('c', key, attempt);
  const links = linksFor(key);
  const content = confirmationEmail(`${siteOrigin()}/email#confirm=${token}`, links);
  const result = await deliverOnce(`email-sends/confirmation/${key}/${attempt}.json`, {
    to: [normalized], ...content,
    tags: [{ name: 'app', value: 'a305x' }, { name: 'kind', value: 'confirmation' }],
  }, `a305x-confirm-${key}-${attempt}`, async () => {
    const fresh = await subscriber(key);
    return emailReady() && !blocked(fresh) && fresh?.confirmation?.id === attempt && !fresh.confirmation.usedAt && fresh.confirmation.expiresAt > Date.now();
  });
  await mutatePrivate(subscriberPath(key), (old) => old?.confirmation?.id === attempt
    ? { ...old, confirmation: { ...old.confirmation, lastSendState: result.state } } : undefined);
  // Provider outcomes stay private; otherwise a provider outage reveals which
  // addresses were already confirmed/suppressed. Storage failures still throw.
  return { confirmationAvailable: ready };
}

async function validConfirmation(token) {
  const parsed = parseToken(token, 'c');
  const record = await subscriber(parsed.key);
  if (!record || blocked(record) || record.confirmation?.usedAt || record.confirmation?.id !== parsed.attempt || record.confirmation.tokenHash !== hash(token) || record.confirmation.expiresAt <= Date.now()) throw new Error('Invalid or expired confirmation link');
  return { ...parsed, record };
}
export async function inspectConfirmation(token) {
  const { record } = await validConfirmation(token);
  return { interests: (record.confirmation.requestedInterests || []).filter((v) => Object.hasOwn(INTERESTS, v)) };
}
export async function confirmAddress(token, interests, consent) {
  if (consent !== true || !validInterests(interests)) throw new Error('Choose your interests and confirm consent');
  const { key, attempt } = await validConfirmation(token);
  const now = new Date().toISOString();
  await mutatePrivate(subscriberPath(key), (old) => {
    if (!old || blocked(old) || old.confirmation?.id !== attempt || old.confirmation.tokenHash !== hash(token)) throw new Error('Invalid confirmation link');
    if (old.confirmation.usedAt || old.confirmation.expiresAt <= Date.now()) throw new Error('Confirmation link expired or already used');
    return { ...old, status: 'subscribed', emailVerified: true, confirmedAt: old.confirmedAt || now,
      confirmedConsentAt: now, confirmedConsentVersion: CONSENT_VERSION, confirmedConsentText: CONSENT_TEXT,
      verifiedInterests: [...new Set(interests)], preferencesUpdatedAt: now,
      consentHistory: consentHistory(old), verificationMethod: 'double-opt-in-v2',
      confirmation: { ...old.confirmation, usedAt: now } };
  });
  return { ok: true, preferencesToken: tokenFor('p', key) };
}

function unsubscribedRecord(old, email) {
  return { ...old, ...(email && !old?.email ? { email } : {}),
    status: 'unsubscribed', emailVerified: false, confirmation: null, unsubscribedAt: old?.unsubscribedAt || new Date().toISOString(),
    suppressionReason: old?.suppressionReason || (['bounced', 'complained', 'suppressed'].includes(old?.status) ? old.status : 'unsubscribe'), suppressedAt: old?.suppressedAt || new Date().toISOString() };
}
export async function unsubscribeKey(key, email) {
  await mutatePrivate(subscriberPath(key), (old) => unsubscribedRecord(old, email));
}
export async function unsubscribeToken(token) {
  // PR #2 compatibility is deliberately unsubscribe-only. Retain its original
  // secret if it ever sent links; never use it to confer confirmation authority.
  if (typeof token === 'string' && /^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    const secret = process.env.A305X_TOKEN_SECRET || '';
    if (!/^[A-Za-z0-9_-]{43,}$/.test(secret)) throw new Error('Invalid unsubscribe link');
    const [key, nonce, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(`unsubscribe:${key}:${nonce}`).digest('base64url');
    if (!equal(signature, expected)) throw new Error('Invalid unsubscribe link');
    await mutatePrivate(subscriberPath(key), (old) => {
      if (!old || old.unsubscribeNonce !== nonce) throw new Error('Invalid unsubscribe link');
      return unsubscribedRecord(old);
    });
    return;
  }
  const { key } = parseToken(token, 'u');
  await unsubscribeKey(key);
}
export async function preferences(token, interests) {
  const { key } = parseToken(token, 'p');
  const current = await subscriber(key);
  if (!confirmed(current)) throw new Error('This address is not an active confirmed subscriber');
  if (interests === undefined) return { interests: current.verifiedInterests };
  if (!validInterests(interests)) throw new Error('Select at least one interest');
  const record = await mutatePrivate(subscriberPath(key), (old) => {
    if (!confirmed(old)) throw new Error('This address cannot receive updates');
    return { ...old, verifiedInterests: [...new Set(interests)], preferencesUpdatedAt: new Date().toISOString(), preferenceSource: '/email',
      consentHistory: consentHistory(old), confirmedConsentAt: new Date().toISOString(), confirmedConsentText: CONSENT_TEXT, confirmedConsentVersion: CONSENT_VERSION };
  });
  return { interests: record.verifiedInterests };
}

export async function suppress(key, reason) {
  await mutatePrivate(subscriberPath(key), (old) => ({ ...old, status: old?.status === 'unsubscribed' ? 'unsubscribed' : 'suppressed',
    emailVerified: false, confirmation: null,
    suppressionReason: old?.suppressionReason || reason, suppressedAt: old?.suppressedAt || new Date().toISOString() }));
}
