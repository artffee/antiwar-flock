export function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function clientIp(req) {
  // Vercel overwrites this header. Do not trust a caller-supplied forwarded chain.
  return String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
export function parseBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return null;
  if (req.headers['sec-fetch-site'] === 'cross-site') return null;
  if (Number(req.headers['content-length'] || 0) > 4096) return null;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 4096) return null;
    return body;
  } catch { return null; }
}
