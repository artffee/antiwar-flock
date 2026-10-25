import crypto from 'node:crypto';

const EMAIL = /^[^\s@<>\x00-\x1f\x7f]+@[^\s@<>\x00-\x1f\x7f]+\.[^\s@<>\x00-\x1f\x7f]+$/;
export const validEmail = (value) => typeof value === 'string' && value.length <= 254 && EMAIL.test(value);
export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const nonce = () => crypto.randomBytes(32).toString('base64url');

export function tokenSecret() {
  const value = process.env.A305X_TOKEN_SECRET || '';
  if (!/^[A-Za-z0-9_-]{43,}$/.test(value)) throw new Error('Confirmation secret not configured');
  return value;
}

// Tokens are reproducible for an idempotent delivery retry, without storing a bearer link.
export function makeToken(key, random, purpose) {
  const mac = crypto.createHmac('sha256', tokenSecret()).update(`${purpose}:${key}:${random}`).digest('base64url');
  return `${key}.${random}.${mac}`;
}

export function tokenKey(token, purpose) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [key, random] = token.split('.');
  const expected = makeToken(key, random, purpose);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ? key : null;
}

export function emailConfiguration() {
  if (process.env.EMAIL_CONFIRMATION_ENABLED !== 'true') throw new Error('Confirmation delivery is disabled');
  tokenSecret();
  const from = process.env.A305X_EMAIL_FROM || '';
  const replyTo = process.env.A305X_EMAIL_REPLY_TO || '';
  if (!validEmail(from) || !validEmail(replyTo) || !process.env.RESEND_API_KEY) throw new Error('Email provider is not configured');
  const site = new URL(process.env.A305X_SITE_URL || '');
  if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash) throw new Error('Invalid site origin');
  // Explicit configuration only. Never construct a confirmation URL from request headers.
  return { from, replyTo, origin: site.origin };
}

export function emailAvailable() {
  try { emailConfiguration(); return true; } catch { return false; }
}

const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendConfirmation(record, key) {
  const pending = record.confirmation;
  const confirm = `${pending.sender.origin}/confirm#token=${makeToken(key, pending.nonce, 'confirm')}`;
  const leave = `${pending.sender.origin}/confirm#action=unsubscribe&token=${makeToken(key, record.unsubscribeNonce, 'unsubscribe')}`;
  const text = `Confirm your A305X email updates\n\nYou requested product-launch and artwork updates from A305X. Confirm your address and saved interests:\n${confirm}\n\nThis link expires 24 hours after the request and can be used once. Open the link, then choose Confirm subscription. Until you confirm, this request does not activate updates.\n\nIf you did not request this, ignore this email. To cancel the request or unsubscribe: ${leave}\n\nNeed a new link? ${pending.sender.origin}/signup\nA305X — Miami, Florida`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Confirm your A305X subscription</title></head><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#18202a;background:#fff;padding:24px"><main style="max-width:560px;margin:auto"><p>A305X / MIAMI, EARTH</p><h1>One more step to join the fluck.</h1><p>You requested A305X product-launch and artwork updates. Confirm your address and saved interests to activate this request.</p><p><a style="display:inline-block;background:#18202a;color:#fff;padding:14px 20px;border-radius:8px" href="${escape(confirm)}">Confirm subscription</a></p><p>This single-use link expires 24 hours after your request. On the next page, choose <strong>Confirm subscription</strong>.</p><p>If you did not request this, ignore this email. You can also <a href="${escape(leave)}">cancel the request or unsubscribe</a>.</p><p><a href="${escape(pending.sender.origin)}/signup">Request a new link</a></p><p>A305X — Miami, Florida</p></main></body></html>`;
  const payload = { from: `A305X <${pending.sender.from}>`, to: [record.email], reply_to: pending.sender.replyTo, subject: 'Confirm your A305X email updates', text, html };
  // Retry the identical payload/key only. Acceptance is not proof of inbox delivery.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `a305x-confirm-${pending.tokenHash}` },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.id !== 'string' || !data.id) throw new Error('No provider message ID');
        return data.id;
      }
      if (response.status < 500 && response.status !== 429) return null;
    } catch { /* An uncertain send may safely retry with the same idempotency key. */ }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}
