import { get, put, list, BlobPreconditionFailedError } from '@vercel/blob';
import { emailStorageOptions } from './email-config.js';

// Subscriber/security reads must never turn an outage or malformed record into
// an absent record, and must bypass the CDN's stale copies.
export async function readPrivate(path) {
  const result = await get(path, { access: 'private', useCache: false, ...emailStorageOptions() });
  if (!result) return { value: null, etag: null };
  if (!result.blob?.etag) throw new Error('Storage did not supply a version');
  const value = JSON.parse(await new Response(result.stream).text());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid private record');
  return { value, etag: result.blob.etag };
}

export async function mutatePrivate(path, change) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { value, etag } = await readPrivate(path);
    const next = change(value);
    if (next === undefined) return value;
    try {
      await put(path, JSON.stringify(next), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json',
        ...emailStorageOptions(), allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
      });
      return next;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      // Concurrent first creation can report AlreadyExists, not HTTP 412.
      if (!etag && (await readPrivate(path)).value) continue;
      throw error;
    }
  }
  throw new Error('Concurrent update; retry later');
}

export async function listPrivate(prefix) {
  const paths = [];
  let cursor;
  do {
    const result = await list({ prefix, limit: 1000, ...emailStorageOptions(), ...(cursor ? { cursor } : {}) });
    paths.push(...result.blobs.map((blob) => blob.pathname));
    if (paths.length > 5000) throw new Error('Audience exceeds this manual sending tool');
    cursor = result.hasMore ? result.cursor : undefined;
    if (result.hasMore && !cursor) throw new Error('Incomplete storage listing');
  } while (cursor);
  return paths;
}
