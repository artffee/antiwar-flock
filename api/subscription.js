import { inspectConfirmation, confirmAddress, unsubscribeToken, preferences } from './_lib/subscribers.js';
import { headers, bodyJson, sameOrigin, clientIp } from './_lib/email-http.js';
import { checkRateLimit } from './_lib/store.js';

export default async function handler(req, res) {
  headers(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use the button in your A305X email to manage your subscription.' });
  }
  // RFC 8058 POST requests require no cookies or extra confirmation. GETs
  // from mail scanners never mutate subscription status.
  const oneClick = req.query?.token;
  let body;
  try {
    body = oneClick ? { action: 'unsubscribe', token: oneClick } : bodyJson(req);
    if (!oneClick && !sameOrigin(req)) throw new Error('Invalid origin');
  } catch { return res.status(400).json({ error: 'Invalid request' }); }
  try {
    // A shared mail-service IP must never prevent a signed unsubscribe.
    if (body.action === 'unsubscribe') {
      await unsubscribeToken(body.token);
      return res.status(200).json({ ok: true });
    }
    if (!await checkRateLimit(clientIp(req), 'email-links', 30)) return res.status(429).json({ error: 'Please wait a few minutes and try again.' });
    if (body.action === 'inspect') return res.status(200).json(await inspectConfirmation(body.token));
    if (body.action === 'confirm') return res.status(200).json(await confirmAddress(body.token, body.interests, body.consent));
    if (body.action === 'preferences') return res.status(200).json({ ok: true, ...await preferences(body.token, body.interests) });
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    const invalid = /link|interest|consent|subscriber|cannot receive/i.test(error.message);
    return res.status(invalid ? 400 : 503).json({ error: invalid ? 'This link is invalid, expired, or no longer active. Request a new confirmation on the signup page.' : 'We could not save this change. Please try again.' });
  }
}
