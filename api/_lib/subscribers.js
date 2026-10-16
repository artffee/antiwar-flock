import crypto from 'node:crypto';
import { mutatePrivate, readPrivate } from './private-store.js';
import { CONSENT_VERSION, CONSENT_TEXT, INTERESTS, ORIGIN, hash, emailKey, parseToken, tokenFor, linksFor, subscriberPath, validInterests } from './email-tokens.js';
import { emailReady, deliverOnce } from './email-provider.js';
import { confirmationEmail } from './email-templates.js';

export function blocked(record) {
  return !!record && (!!record.unsubscribedAt || !!record.suppressedAt || !!record.suppressionReason || record.unsubscribed === true || ['unsubscribed', 'suppressed', 'bounced', 'complained'].includes(record.status));
}
export function confirmed(record) {
  return !!record && !blocked(record) && record.status === 'subscribed' && record.emailVerified === true &&
    record.confirmedConsentVersion === CONSENT_VERSION && !!record.confirmedAt && !!record.confirmedConsentAt && validInterests(record.verifiedInterests);
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
  const record = await mutatePrivate(subscriberPath(key), (old) => {
    if (blocked(old)) return;
    const interests = [...new Set([...(Array.isArray(old?.interests) ? old.interests : []), interest])];
    const base = { ...old, email: normalized, joinedAt: old?.joinedAt || new Date(now).toISOString(),
      status: confirmed(old) ? 'subscribed' : 'pending', emailVerified: confirmed(old),
      interests, consentAt: old?.consentAt || new Date(now).toISOString(),
      consentVersion: old?.consentVersion || CONSENT_VERSION, consentText: old?.consentText || CONSENT_TEXT,
      source: old?.source || '/signup', preferencesUpdatedAt: new Date(now).toISOString(),
      requestConsent: { at: new Date(now).toISOString(), version: CONSENT_VERSION, text: CONSENT_TEXT, source: '/signup' } };
    if (!ready || (confirmed(old) && (old.verifiedInterests.includes('all') || old.verifiedInterests.includes(interest)))) return base;
    const requests = (old?.confirmationRequests || []).filter((time) => now - time < 3600000);
    if (requests.length >= 3 || now - (requests.at(-1) || 0) < 60000) return base;
    const attempt = old?.confirmation?.lastSendState === 'retryable' && old.confirmation.expiresAt > now && now - old.confirmation.createdAt < 23 * 3600000
      ? old.confirmation.id : requestId;
    const token = tokenFor('c', key, attempt);
    return { ...base, confirmationRequests: [...requests, now], confirmation: {
      id: attempt, requestId, tokenHash: hash(token), createdAt: attempt === old?.confirmation?.id ? old.confirmation.createdAt : now,
      expiresAt: attempt === old?.confirmation?.id ? old.confirmation.expiresAt : now + 24 * 3600000,
    } };
  });
  if (!ready || blocked(record) || record?.confirmation?.requestId !== requestId) return { confirmationAvailable: ready };
  const attempt = record.confirmation.id;
  const token = tokenFor('c', key, attempt);
  const links = linksFor(key);
  const content = confirmationEmail(`${ORIGIN}/email#confirm=${token}`, links);
  const result = await deliverOnce(`email-sends/confirmation/${key}/${attempt}.json`, {
    to: [normalized], ...content,
    tags: [{ name: 'app', value: 'a305x' }, { name: 'kind', value: 'confirmation' }],
  }, `a305x-confirm-${key}-${attempt}`, async () => {
    const fresh = await subscriber(key);
    return emailReady() && !blocked(fresh) && fresh?.confirmation?.id === attempt && !fresh.confirmation.usedAt && fresh.confirmation.expiresAt > Date.now();
  });
  await mutatePrivate(subscriberPath(key), (old) => old?.confirmation?.id === attempt
    ? { ...old, confirmation: { ...old.confirmation, lastSendState: result.state } } : undefined);
  if (['failed', 'retryable', 'uncertain'].includes(result.state)) throw new Error('confirmation_delivery_failed');
  return { confirmationAvailable: ready };
}

async function validConfirmation(token) {
  const parsed = parseToken(token, 'c');
  const record = await subscriber(parsed.key);
  if (!record || blocked(record) || record.confirmation?.id !== parsed.attempt || record.confirmation.tokenHash !== hash(token) || record.confirmation.expiresAt < Date.now()) throw new Error('Invalid or expired confirmation link');
  return { ...parsed, record };
}
export async function inspectConfirmation(token) {
  const { record } = await validConfirmation(token);
  return { alreadyConfirmed: !!record.confirmation.usedAt, interests: (record.interests || []).filter((v) => Object.hasOwn(INTERESTS, v)) };
}
export async function confirmAddress(token, interests, consent) {
  if (consent !== true || !validInterests(interests)) throw new Error('Choose your interests and confirm consent');
  const { key, attempt } = await validConfirmation(token);
  const now = new Date().toISOString();
  await mutatePrivate(subscriberPath(key), (old) => {
    if (!old || blocked(old) || old.confirmation?.id !== attempt || old.confirmation.tokenHash !== hash(token)) throw new Error('Invalid confirmation link');
    if (old.confirmation.usedAt) return;
    if (old.confirmation.expiresAt < Date.now()) throw new Error('Confirmation link expired');
    return { ...old, status: 'subscribed', emailVerified: true, confirmedAt: old.confirmedAt || now,
      confirmedConsentAt: now, confirmedConsentVersion: CONSENT_VERSION, confirmedConsentText: CONSENT_TEXT,
      verifiedInterests: [...new Set(interests)], preferencesUpdatedAt: now,
      confirmation: { ...old.confirmation, usedAt: now } };
  });
  return { ok: true, preferencesToken: tokenFor('p', key) };
}

export async function unsubscribeKey(key, email) {
  await mutatePrivate(subscriberPath(key), (old) => ({ ...old, ...(email && !old?.email ? { email } : {}),
    status: 'unsubscribed', unsubscribedAt: old?.unsubscribedAt || new Date().toISOString(),
    suppressionReason: old?.suppressionReason || 'unsubscribe', suppressedAt: old?.suppressedAt || new Date().toISOString() }));
}
export async function unsubscribeToken(token) {
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
      confirmedConsentAt: new Date().toISOString(), confirmedConsentText: CONSENT_TEXT };
  });
  return { interests: record.verifiedInterests };
}

export async function suppress(key, reason) {
  await mutatePrivate(subscriberPath(key), (old) => ({ ...old, status: old?.status === 'unsubscribed' ? 'unsubscribed' : 'suppressed',
    suppressionReason: old?.suppressionReason || reason, suppressedAt: old?.suppressedAt || new Date().toISOString() }));
}
