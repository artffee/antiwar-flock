import crypto from 'node:crypto';
import { put, get, BlobPreconditionFailedError } from '@vercel/blob';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const COUNTER_PATH = 'meta/flock-counter.json';

async function readJsonBlob(pathname, useCache) {
  try {
    const result = await get(pathname, { access: 'private', useCache: useCache !== false });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeJsonBlob(pathname, data) {
  return put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
}

export async function checkRateLimit(ip, bucket, max, windowMs) {
  const pathname = `ratelimit/${bucket || 'default'}/${hashIp(ip)}.json`;
  const limit = max || MAX_PER_WINDOW;
  const window = windowMs || WINDOW_MS;
  const now = Date.now();
  const existing = await readJsonBlob(pathname, false);
  let hits = Array.isArray(existing?.hits) ? existing.hits : [];
  hits = hits.filter((t) => now - t < window);
  if (hits.length >= limit) return false;
  hits.push(now);
  await writeJsonBlob(pathname, { hits });
  return true;
}

export async function getFlockCount() {
  const counter = await readJsonBlob(COUNTER_PATH, false);
  return counter?.count || 0;
}

export async function saveFlock({ rebel, recipientName, message }) {
  const current = await readJsonBlob(COUNTER_PATH, false);
  const flockNumber = (current?.count || 0) + 1;
  await writeJsonBlob(COUNTER_PATH, { count: flockNumber });
  const shareId = crypto.randomBytes(9).toString('base64url');
  const record = {
    flockNumber,
    rebel,
    recipientName,
    message,
    createdAt: new Date().toISOString(),
  };
  await put(`flocks/${shareId}.json`, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
  return { shareId, flockNumber };
}

export async function loadFlock(shareId) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(String(shareId || ''))) return null;
  return readJsonBlob(`flocks/${shareId}.json`);
}

export async function checkSignupStorage() {
  // A private read checks the connection without creating records or exposing data.
  await get('meta/signup-readiness.json', { access: 'private', useCache: false });
}

// Read failures must propagate: treating an outage as an empty list loses suppressions.
export async function readPrivateRecord(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result) return null;
  if (!result.blob?.etag) throw new Error('Conditional storage is unavailable');
  const data = JSON.parse(await new Response(result.stream).text());
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid private record');
  return { data, etag: result.blob.etag };
}

// The reducer is synchronous and may run again after a conflict. Never send email here.
export async function updatePrivateRecord(pathname, reduce) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await readPrivateRecord(pathname);
    const update = reduce(current?.data || null);
    if (!update.record) return update.result;
    try {
      await put(pathname, JSON.stringify(update.record), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json',
        allowOverwrite: Boolean(current),
        ...(current ? { ifMatch: current.etag } : {}),
      });
      return update.result;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      // A simultaneous create can report an already-existing blob rather than 412.
      if (!current && await readPrivateRecord(pathname)) continue;
      throw error;
    }
  }
  throw new Error('Storage contention; retry the request');
}

export async function checkSignupRateLimit(identifier, bucket, max = 5, windowMs = WINDOW_MS) {
  return updatePrivateRecord(`ratelimit/${bucket}/${hashIp(identifier)}.json`, (existing) => {
    const now = Date.now();
    const hits = (existing?.hits || []).filter((time) => now - time < windowMs);
    if (hits.length >= max) return { result: false };
    return { record: { hits: [...hits, now] }, result: true };
  });
}

// Retain the existing entry point while keeping subscription state transitions isolated.
export { saveEmail } from './subscriptions.js';
