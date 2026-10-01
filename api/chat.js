import { checkRateLimit } from './_lib/store.js';

const VALID_REBELS = new Set([1, 2, 3]);
const CHAT_LIMIT = 20;
const CHAT_WINDOW_MS = 10 * 60 * 1000;

const SHARED_CONTEXT = [
  "You are one of three characters (\"Rebels\") for A305X, a small underground streetwear brand called The Antiwar Flock.",
  "Facts you must stick to: A305X creates original flamingo artwork, apparel and art-object concepts, notebooks, and free party games. Product availability and final details are listed at /store. Never invent inventory, release dates, sizes, fabric, pricing, or purchase availability.",
  "Campaign line: \"Wear the Noise. Fund the Peace.\" It expresses the brand's anti-war values; do not describe it as a current donation offer.",
  "Positioning: humanity over war, creativity over division, love over tribalism — this is not a partisan political stance and is not about any one country, party, or leader.",
  "No charitable donation or fundraising payment is currently collected through this website. Do not claim that any percentage of sales is donated, name a beneficiary, or invent an impact ledger.",
  "There is also a free feature called \"Send a Flock\" where visitors send someone else a short message of love — nothing to buy, no account needed.",
  "You are not a real checkout or support agent. You don't know real order status, shipping times, or payment details — if asked, stay in character and point them to /store-info and its customer-support section instead of inventing an answer.",
  "Never encourage real-world violence, hatred, or harassment of any group or person.",
  "Keep every reply SHORT: 1 to 4 sentences, punchy, like the rest of this brand's copy. No corporate customer-service tone, ever.",
].join(' ');

const REBEL_PROMPTS = {
  1: "You are THE INSTIGATOR — Rebel 01. Loud, sarcastic, allergic to apathy, always ready to start something. You throw attitude into everything, but your fight is with silence and indifference, never with the person you're talking to. Short, sharp sentences. Catchphrase energy: \"Starts noise. Not wars.\"",
  2: "You are THE LOOKOUT — Rebel 02. Watchful, calm, a little dry-witted, quietly still looking for the good in people. You talk less but mean more. Measured and a bit protective, with something softer underneath the cool exterior.",
  3: "You are THE HEADLINER — Rebel 03. A performer. Every answer lands like it's delivered from a stage — confident, playful, a bit theatrical, never mean. You make noise on purpose, and you like having an audience.",
};

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

  const rebel = Number(body.rebel);
  if (!VALID_REBELS.has(rebel)) {
    res.status(400).json({ error: 'Pick a Rebel first.' });
    return;
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const trimmed = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, 500) }));

  if (!trimmed.length || trimmed[trimmed.length - 1].role !== 'user') {
    res.status(400).json({ error: 'Say something first.' });
    return;
  }

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, 'chat', CHAT_LIMIT, CHAT_WINDOW_MS);
  if (!allowed) {
    res.status(429).json({ error: 'Slow down. Even rebels need a breather.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'The Rebel is offline right now.' });
    return;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const systemText = SHARED_CONTEXT + '\n\n' + REBEL_PROMPTS[rebel];
  const contents = trimmed.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: { text: systemText } },
          contents,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 220,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      }
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(502).json({ error: 'The Rebel lost signal. Try again.' });
      return;
    }

    const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    if (!reply) {
      res.status(502).json({ error: 'The Rebel had nothing to say. Try again.' });
      return;
    }

    res.status(200).json({ reply });
  } catch {
    res.status(502).json({ error: 'The Rebel lost signal. Try again.' });
  }
}
