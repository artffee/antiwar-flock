import crypto from 'node:crypto';

export const CONSENT_VERSION = '2026-10-16';
export const CONSENT_TEXT = 'I would like A305X product-launch and art updates by email for my selected interests.';
export const INTERESTS = Object.freeze({
  all: 'All new art & drops', tee: 'Wear the Message Tee',
  'flying-fluck': 'Flying Fluck journal', 'wall-art': 'Wall art',
  'chill-pill': 'The Chill Pill object', 'field-manual': 'Field Manual 01',
  'drama-dump': 'Daily Drama Dump physical edition',
});
export const ORIGIN = 'https://www.a305x.com';
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const emailKey = (email) => hash(email.trim().toLowerCase());
export const validEmail = (email) => typeof email === 'string' && email.length <= 254 && /^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(email);
export const validInterests = (values) => Array.isArray(values) && values.length > 0 && values.length <= 7 && values.every((v) => typeof v === 'string' && Object.hasOwn(INTERESTS, v));

function secret() {
  const value = process.env.EMAIL_TOKEN_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error('Email token secret is not configured');
  return value;
}
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function tokenFor(purpose, key, attempt = '') {
  const message = `${purpose}.${key}.${attempt}`;
  return `${message}.${crypto.createHmac('sha256', secret()).update(message).digest('base64url')}`;
}
export function parseToken(token, purpose) {
  if (typeof token !== 'string' || token.length > 256) throw new Error('Invalid link');
  const [p, key, attempt, signature, ...extra] = token.split('.');
  if (p !== purpose || extra.length || !/^[a-f0-9]{64}$/.test(key || '') || !/^[a-f0-9]{0,32}$/.test(attempt || '') || !signature || (purpose === 'c' && attempt.length !== 32)) throw new Error('Invalid link');
  if (!equal(tokenFor(p, key, attempt), token)) throw new Error('Invalid link');
  return { key, attempt };
}
export const subscriberPath = (key) => `emails/${key}.json`;
export function linksFor(key) {
  return {
    unsubscribe: `${ORIGIN}/email#unsubscribe=${tokenFor('u', key)}`,
    oneClick: `${ORIGIN}/api/subscription?token=${tokenFor('u', key)}`,
    preferences: `${ORIGIN}/email#preferences=${tokenFor('p', key)}`,
  };
}
