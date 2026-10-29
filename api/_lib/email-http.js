export function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function bodyJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '') || req.headers['sec-fetch-site'] === 'cross-site') throw new Error('Invalid request');
  if (Number(req.headers['content-length'] || 0) > 4096) throw new Error('Request too large');
  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 4096) throw new Error('Request too large');
    body = JSON.parse(body);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 4096) throw new Error('Invalid request');
  return body;
}
export function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
// Vercel overwrites this header; a user-supplied forwarded chain is not trusted.
export const clientIp = (req) => String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
