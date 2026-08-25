import { checkRateLimit, saveEmail } from './_lib/store.js';

const EMAIL_RE = new RegExp('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const email = String(body.email ?? '').trim().slice(0, 254);

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'That doesn’t look like an email.' });
    return;
  }

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, 'join');
  if (!allowed) {
    res.status(429).json({ error: 'Slow down. Try again in a few minutes.' });
    return;
  }

  try {
    const result = await saveEmail(email);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: 'Something broke. Try again.' });
  }
}
