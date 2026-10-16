import { Webhook } from 'svix';
import { mutatePrivate, readPrivate } from './_lib/private-store.js';
import { hash, emailKey, validEmail } from './_lib/email-tokens.js';
import { suppress } from './_lib/subscribers.js';
import { headers } from './_lib/email-http.js';

export const config = { api: { bodyParser: false } };
const statuses = { 'email.sent': 1, 'email.delivery_delayed': 2, 'email.delivered': 3, 'email.failed': 4, 'email.bounced': 5, 'email.complained': 6, 'email.suppressed': 7 };

export async function applyEvent(event, eventId) {
  const eventPath = `email-events/${hash(eventId)}.json`;
  if ((await readPrivate(eventPath)).value?.processed) return;
  const data = event.data || {};
  const recipients = event.type === 'suppression.added' ? [data.email] : data.to;
  if (!statuses[event.type] && event.type !== 'suppression.added') return;
  if (!Array.isArray(recipients) || recipients.length > 50 || !recipients.every(validEmail)) throw new Error('Malformed delivery event');
  for (const email of recipients) {
    const key = emailKey(email);
    if (['email.bounced', 'email.complained', 'email.suppressed', 'suppression.added'].includes(event.type)) await suppress(key, event.type);
    if (typeof data.email_id === 'string') {
      await mutatePrivate(`email-delivery/${hash(data.email_id)}/${key}.json`, (old) => ({
        providerId: data.email_id, recipientKey: key,
        status: (old?.rank || 0) > (statuses[event.type] || 0) ? old.status : event.type,
        rank: Math.max(old?.rank || 0, statuses[event.type] || 0),
        updatedAt: new Date().toISOString(),
      }));
    }
  }
  // Acknowledgement is written only after durable suppression/delivery updates.
  await mutatePrivate(eventPath, (old) => old?.processed ? undefined : { processed: true, type: event.type, processedAt: new Date().toISOString() });
}

export default async function handler(req, res) {
  headers(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!process.env.RESEND_WEBHOOK_SECRET) return res.status(503).json({ error: 'Webhook not configured' });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      chunks.push(Buffer.from(chunk));
      if (size > 65536) return res.status(413).json({ error: 'Payload too large' });
    }
  } catch { return res.status(400).json({ error: 'Invalid payload' }); }
  let event;
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw, {
      'svix-id': req.headers['svix-id'], 'svix-timestamp': req.headers['svix-timestamp'], 'svix-signature': req.headers['svix-signature'],
    });
    // Svix v2 verifies bytes and returns void. Parse only after verification.
    event = JSON.parse(raw);
  } catch { return res.status(400).json({ error: 'Invalid signature' }); }
  try {
    await applyEvent(event, req.headers['svix-id']);
    return res.status(200).json({ ok: true });
  } catch { return res.status(503).json({ error: 'Event was not persisted; retry required' }); }
}
