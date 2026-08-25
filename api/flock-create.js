import { checkRateLimit, saveFlock } from './_lib/store.js';

const VALID_REBELS = new Set([1, 2, 3]);
const CONTROL_CHARS = new RegExp('[\\x00-\\x1F\\x7F]', 'g');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function clean(value, max) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, max);
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

  const rebel = Number(body.rebel);
  const recipientName = clean(body.recipientName, 40);
  const message = clean(body.message, 150);

  if (!VALID_REBELS.has(rebel)) {
    res.status(400).json({ error: 'Pick a Rebel first.' });
    return;
  }
  if (!recipientName) {
    res.status(400).json({ error: 'Who is this for?' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'Say something first.' });
    return;
  }

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: 'Slow down. The Flock needs a minute to catch its breath.' });
    return;
  }

  try {
    const { shareId, flockNumber } = await saveFlock({ rebel, recipientName, message });
    res.status(200).json({ shareId, flockNumber });
  } catch {
    res.status(500).json({ error: 'The Flock got lost in the wind. Try again.' });
  }
}
