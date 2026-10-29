import crypto from 'node:crypto';
import { put, get } from '@vercel/blob';
import { mutatePrivate, readPrivate } from './private-store.js';

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
  const ticket = crypto.randomUUID();
  const record = await mutatePrivate(pathname, (old) => {
    const hits = (Array.isArray(old?.hits) ? old.hits : []).filter((t) => now - t < window);
    if (hits.length >= limit) return;
    return { hits: [...hits, now], ticket };
  });
  return record?.ticket === ticket;
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
  await readPrivate('meta/signup-readiness.json');
}
