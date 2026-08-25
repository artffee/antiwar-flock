import crypto from 'node:crypto';
import { put, get, list } from '@vercel/blob';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

async function readJsonBlob(pathname) {
  try {
    const result = await get(pathname, { access: 'private' });
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

export async function checkRateLimit(ip) {
  const pathname = `ratelimit/${hashIp(ip)}.json`;
  const now = Date.now();
  const existing = await readJsonBlob(pathname);
  let hits = Array.isArray(existing?.hits) ? existing.hits : [];
  hits = hits.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return false;
  hits.push(now);
  await writeJsonBlob(pathname, { hits });
  return true;
}

export async function getFlockCount() {
  let count = 0;
  let cursor;
  do {
    const res = await list({ prefix: 'flocks/', cursor, limit: 1000 });
    count += res.blobs.length;
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return count;
}

export async function saveFlock({ rebel, recipientName, message }) {
  const count = await getFlockCount();
  const flockNumber = count + 1;
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
