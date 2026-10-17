import crypto from 'node:crypto';
import { mutatePrivate, readPrivate } from './private-store.js';
import { hash } from './email-tokens.js';

export function emailReady(marketing = false) {
  const from = process.env.EMAIL_FROM || '';
  return process.env.EMAIL_ENABLED === 'true' && !!process.env.RESEND_API_KEY &&
    Buffer.byteLength(process.env.EMAIL_TOKEN_SECRET || '') >= 32 &&
    !!process.env.RESEND_WEBHOOK_SECRET && /^A305X <[^\s<>@]+@(?:[a-z0-9-]+\.)*a305x\.com>$/.test(from) &&
    (!marketing || (process.env.EMAIL_MARKETING_ENABLED === 'true' && (process.env.EMAIL_POSTAL_ADDRESS || '').trim().length >= 10));
}

// Durable send journal + provider idempotency protect retries and overlapping
// requests. An ambiguous send older than the provider's 24h window is held for
// manual investigation instead of risking a duplicate.
export async function deliverOnce(path, payload, idempotencyKey, canSend) {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const providerPayload = { from: process.env.EMAIL_FROM, reply_to: 'orionmind@gmail.com', ...payload };
  const digest = hash(JSON.stringify(providerPayload));
  const job = await mutatePrivate(path, (old) => {
    if (old && (['sent', 'failed', 'uncertain', 'skipped'].includes(old.state) || old.leaseUntil > now)) return;
    if (old && (now - old.firstAttemptAt > 23 * 3600000 || old.payloadDigest !== digest)) return { ...old, state: 'uncertain', leaseUntil: 0 };
    return { ...old, state: 'sending', owner, firstAttemptAt: old?.firstAttemptAt || now, leaseUntil: now + 120000, attempts: (old?.attempts || 0) + 1, payloadDigest: digest };
  });
  if (job.owner !== owner) return { state: job.state, id: job.providerId };
  if (!await canSend()) {
    await mutatePrivate(path, (old) => old.owner === owner ? { ...old, state: 'skipped', leaseUntil: 0 } : undefined);
    return { state: 'skipped' };
  }
  let result;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(providerPayload),
    });
    const data = await response.json();
    if (response.ok && typeof data.id === 'string') result = { state: 'sent', providerId: data.id, acceptedAt: new Date().toISOString() };
    else result = { state: response.status === 429 || response.status >= 500 ? 'retryable' : 'failed', httpStatus: response.status };
  } catch {
    result = { state: 'retryable', error: 'network_or_timeout' };
  }
  await mutatePrivate(path, (old) => old.owner === owner ? { ...old, ...result, leaseUntil: 0 } : undefined);
  return { state: result.state, id: result.providerId };
}

export async function deliveryState(path) {
  return (await readPrivate(path)).value;
}
