import { checkRateLimit, checkSignupStorage } from './_lib/store.js';
import { register, unsubscribeKey } from './_lib/subscribers.js';
import { INTERESTS, validEmail, emailKey } from './_lib/email-tokens.js';
import { emailReady } from './_lib/email-provider.js';
import { headers, bodyJson, sameOrigin, clientIp } from './_lib/email-http.js';

export default async function handler(req, res) {
  headers(res);
  if (req.method === 'GET') {
    try {
      await checkSignupStorage();
      return res.status(200).json({ available: true, confirmationAvailable: emailReady() });
    } catch { return res.status(503).json({ available: false }); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body;
  try { body = bodyJson(req); } catch { return res.status(400).json({ error: 'Invalid request' }); }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const action = body.action || 'subscribe';
  const interest = body.interest ?? 'all';
  if (!validEmail(email)) return res.status(400).json({ error: 'That doesn’t look like an email.' });
  if (!['subscribe', 'unsubscribe'].includes(action)) return res.status(400).json({ error: 'Choose a valid email preference.' });
  if (action === 'subscribe' && body.consent !== true) return res.status(400).json({ error: 'Please confirm that you want A305X email updates.' });
  if (action === 'subscribe' && (typeof interest !== 'string' || !Object.hasOwn(INTERESTS, interest))) return res.status(400).json({ error: 'Please choose an interest from the list.' });
  if (body.website || !sameOrigin(req)) return res.status(400).json({ error: 'Unable to submit this form.' });
  try {
    if (!await checkRateLimit(clientIp(req), 'join')) return res.status(429).json({ error: 'Too many requests. Please try again in 10 minutes.' });
    if (action === 'unsubscribe') {
      await unsubscribeKey(emailKey(email), email.toLowerCase());
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: true, ...await register(email, interest) });
  } catch {
    return res.status(503).json({ error: 'We could not complete email confirmation. Please try again in a minute. Your address will not receive launch updates until confirmed.' });
  }
}
