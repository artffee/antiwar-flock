import { checkRateLimit, checkSignupStorage, saveEmail } from './_lib/store.js';

const EMAIL_RE = new RegExp('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    try {
      await checkSignupStorage();
      res.status(200).json({ available: true });
    } catch {
      res.status(503).json({ available: false });
    }
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const action = body.action || 'subscribe';

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'That doesn’t look like an email.' });
    return;
  }

  if (!['subscribe', 'unsubscribe'].includes(action)) {
    res.status(400).json({ error: 'Choose a valid email preference.' });
    return;
  }
  if (action === 'subscribe' && body.consent !== true) {
    res.status(400).json({ error: 'Please confirm that you want A305X email updates.' });
    return;
  }
  if (body.website) {
    res.status(400).json({ error: 'Unable to submit this form.' });
    return;
  }
  try {
    const allowed = await checkRateLimit(getClientIp(req), 'join');
    if (!allowed) {
      res.status(429).json({ error: 'Too many requests. Please try again in 10 minutes.' });
      return;
    }
    await saveEmail(email, action);
    // Return the same result for new and existing addresses.
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ error: 'Email sign-up is temporarily unavailable. Please try again later.' });
  }
}
