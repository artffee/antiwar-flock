import { checkSignupRateLimit, checkSignupStorage, saveEmail } from './_lib/store.js';
import { emailAvailable, validEmail } from './_lib/email.js';
import { securityHeaders, clientIp, parseBody } from './_lib/request.js';
const INTERESTS = ['all', 'tee', 'wall-art', 'flying-fluck', 'chill-pill', 'field-manual', 'drama-dump'];

export default async function handler(req, res) {
  securityHeaders(res);
  if (req.method === 'GET') {
    try {
      await checkSignupStorage();
      res.status(200).json({ available: emailAvailable(), unsubscribeAvailable: true });
    } catch {
      res.status(503).json({ available: false, unsubscribeAvailable: false });
    }
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = parseBody(req);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const action = body?.action || 'subscribe';
  const interest = body?.interest ?? 'all';
  if (!body || !validEmail(email) || !['subscribe', 'unsubscribe'].includes(action) || body.website ||
      (action === 'subscribe' && (body.consent !== true || !INTERESTS.includes(interest)))) {
    return res.status(400).json({ error: 'Check your email, selected interest, and consent, then try again.' });
  }
  if (action === 'subscribe' && !emailAvailable()) return res.status(503).json({ error: 'Email confirmation is temporarily unavailable. Please try again later.' });
  try {
    const allowed = await checkSignupRateLimit(clientIp(req), `join-${action}`);
    if (!allowed) return res.status(429).json({ error: 'Too many requests. Please try again in 10 minutes.' });
    await saveEmail(email, action, interest);
    // Identical for unknown, pending, confirmed, suppressed, cooldown and provider failure.
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ error: 'Email preferences are temporarily unavailable. Please try again later.' });
  }
}
