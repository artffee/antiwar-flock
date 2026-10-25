import { confirmEmail, unsubscribeToken } from './_lib/subscriptions.js';
import { checkSignupRateLimit } from './_lib/store.js';
import { securityHeaders, clientIp, parseBody } from './_lib/request.js';

export default async function handler(req, res) {
  securityHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Open the email link and use the confirmation button.' });
  }
  const body = parseBody(req);
  if (!body || typeof body.token !== 'string' || !['confirm', 'unsubscribe'].includes(body.action)) {
    return res.status(400).json({ error: 'This link cannot be used. Request a new one on the signup page.' });
  }
  try {
    if (!await checkSignupRateLimit(clientIp(req), `email-${body.action}`, 30)) return res.status(429).json({ error: 'Too many requests. Please try again in 10 minutes.' });
    const success = body.action === 'unsubscribe' ? await unsubscribeToken(body.token) : await confirmEmail(body.token);
    if (!success) return res.status(400).json({ error: 'This link has expired, has already been used, or is no longer valid. You can request a new link or unsubscribe on the signup page.' });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ error: 'Email preferences are temporarily unavailable. Please try again later.' });
  }
}
