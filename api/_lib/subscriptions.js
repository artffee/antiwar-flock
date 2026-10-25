import { readPrivateRecord, updatePrivateRecord } from './store.js';
import { digest, nonce, makeToken, tokenKey, emailConfiguration, sendConfirmation } from './email.js';

export const CONSENT_VERSION = '2026-10-24';
export const CONSENT_TEXT = 'I would like A305X product-launch and art updates by email. I will confirm my email address to activate this request.';
const TTL = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const COOLDOWN = 60 * 1000;
const pathFor = (key) => `emails/${key}.json`;
const suppressionHistory = (record) => ['suppressed', 'bounced', 'complained'].includes(record?.status)
  ? { suppressionReason: record.suppressionReason || record.status, suppressedAt: record.suppressedAt || new Date().toISOString() } : {};
const blocked = (record) => Boolean(record?.suppressedAt || record?.suppressionReason || ['suppressed', 'bounced', 'complained'].includes(record?.status));

// Any future campaign must use this predicate AND check the provider suppression list.
export function canReceiveMarketing(record) {
  return Boolean(record?.status === 'subscribed' && record.emailVerified === true &&
    record.verificationMethod === 'double-opt-in-v1' && record.confirmedAt &&
    record.consentAt && record.consentVersion && !blocked(record));
}

export async function saveEmail(email, action = 'subscribe', interest = 'all') {
  const normalized = email.trim().toLowerCase();
  const key = digest(normalized);
  if (action === 'unsubscribe') return unsubscribeKey(key, normalized);
  const requestedAt = Date.now();
  const sender = emailConfiguration();
  const outcome = await updatePrivateRecord(pathFor(key), (existing) => {
    const now = Date.now();
    if (blocked(existing) || Date.parse(existing?.unsubscribedAt) >= requestedAt) return { result: null };
    if (existing?.lastConfirmationAttemptAt && now - existing.lastConfirmationAttemptAt < COOLDOWN) return { result: null };
    const attempts = (existing?.confirmationAttempts || []).filter((time) => now - time < HOUR);
    if (attempts.length >= 3) return { result: null };
    const old = existing?.confirmation;
    // Resume an uncertain delivery for <23 hours, safely within Resend's 24h dedupe window.
    const retry = old && old.interests.includes(interest) && old.delivery !== 'accepted' && now - old.issuedAt < 23 * HOUR &&
      old.tokenHash === digest(makeToken(key, old.nonce, 'confirm'));
    const random = retry ? old.nonce : nonce();
    const confirmation = retry ? old : {
      nonce: random, tokenHash: digest(makeToken(key, random, 'confirm')),
      issuedAt: now, expiresAt: now + TTL,
      consentAt: new Date(now).toISOString(), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
      interests: [...new Set([...(existing?.interests || []), ...(old?.interests || []), interest])],
      sender, delivery: 'pending',
    };
    const record = {
      ...existing, email: normalized, joinedAt: existing?.joinedAt || new Date(now).toISOString(),
      status: existing?.status || 'pending', emailVerified: existing?.emailVerified === true,
      interests: existing?.interests || [],
      unsubscribeNonce: existing?.unsubscribeNonce || nonce(),
      confirmation, lastConfirmationAttemptAt: now, confirmationAttempts: [...attempts, now],
    };
    return { record, result: record };
  });
  if (!outcome) return;
  // Recheck immediately before delivery: a simultaneous unsubscribe cancels queued sends.
  const latest = await readPrivateRecord(pathFor(key));
  if (latest?.data.confirmation?.tokenHash !== outcome.confirmation.tokenHash || blocked(latest?.data)) return;
  const providerId = await sendConfirmation(outcome, key);
  await updatePrivateRecord(pathFor(key), (record) => {
    if (record?.confirmation?.tokenHash !== outcome.confirmation.tokenHash) return { result: null };
    return { record: { ...record, confirmation: {
      ...record.confirmation, delivery: providerId ? 'accepted' : 'pending',
      ...(providerId ? { providerId, acceptedAt: new Date().toISOString() } : {}),
    } } };
  });
}

export async function confirmEmail(token) {
  const key = tokenKey(token, 'confirm');
  if (!key) return false;
  const tokenHash = digest(token);
  return updatePrivateRecord(pathFor(key), (record) => {
    const pending = record?.confirmation;
    if (!pending || blocked(record) || pending.tokenHash !== tokenHash || Date.now() >= pending.expiresAt) return { result: false };
    const now = new Date().toISOString();
    return { record: {
      ...record, status: 'subscribed', emailVerified: true, confirmedAt: now,
      verificationMethod: 'double-opt-in-v1',
      // The previous consent and unsubscribe dates are retained for the audit trail.
      consentHistory: [...(record.consentHistory || []), ...(record.consentAt ? [{ consentAt: record.consentAt, consentVersion: record.consentVersion, consentText: record.consentText }] : [])],
      consentAt: pending.consentAt, consentVersion: pending.consentVersion, consentText: pending.consentText,
      source: '/signup', interests: [...new Set([...(record.interests || []), ...pending.interests])],
      preferencesUpdatedAt: now, confirmation: null,
    }, result: true };
  });
}

async function unsubscribeKey(key, email) {
  return updatePrivateRecord(pathFor(key), (record) => ({
    record: {
      ...record, ...suppressionHistory(record), ...(email ? { email } : {}), status: 'unsubscribed',
      emailVerified: false, unsubscribedAt: new Date().toISOString(), confirmation: null,
    }, result: true,
  }));
}

export async function unsubscribeToken(token) {
  const key = tokenKey(token, 'unsubscribe');
  if (!key) return false;
  const random = token.split('.')[1];
  // Validate the nonce in the same atomic transition that suppresses the record.
  return updatePrivateRecord(pathFor(key), (record) => {
    if (!record || record.unsubscribeNonce !== random) return { result: false };
    return { record: { ...record, ...suppressionHistory(record), status: 'unsubscribed', emailVerified: false, unsubscribedAt: new Date().toISOString(), confirmation: null }, result: true };
  });
}
