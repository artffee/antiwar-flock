// Local QA only. Excluded from Vercel deployments. Real route modules run inside
// a VM with synthetic Blob storage and a fake email provider; no host secrets
// or outbound-network implementation are available in that VM.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fixture } from '../tests/helpers/email-fixture.mjs';

if (process.env.VERCEL) throw new Error('The synthetic preview server must not run on Vercel');
const root = resolve(import.meta.dirname, '..');
const sandbox = await fixture();
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(body); };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__preview/mode' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const mode = new URLSearchParams(Buffer.concat(chunks).toString()).get('mode');
      sandbox.env.EMAIL_ENABLED = String(mode !== 'disabled'); sandbox.state.failRead = mode === 'storage-failure';
      res.writeHead(303, { Location: '/signup' }); res.end(); return;
    }
    if (url.pathname === '/__preview') {
      const rows = sandbox.outbox.map((item) => {
        const token = item.payload.text.match(/#confirm=([^\s]+)/)?.[1];
        const leave = item.payload.text.match(/#unsubscribe=([^\s]+)/)?.[1];
        const record = sandbox.get(item.payload.to[0]);
        return `<li><strong>${escape(item.payload.to[0])}</strong> — ${escape(record?.status)}<br><a href="/email#confirm=${escape(token)}">Open confirmation</a> · <a href="/email#unsubscribe=${escape(leave)}">Open unsubscribe</a><pre>${escape(JSON.stringify({ verified: record?.emailVerified, interests: record?.verifiedInterests, suppression: record?.suppressionReason }, null, 2))}</pre></li>`;
      }).join('');
      send(res, 200, `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A305X isolated email preview</title><h1>Synthetic email preview</h1><p>No real storage or delivery. Use addresses ending in @example.com.</p><p><a href="/signup">Signup</a></p><form method="post" action="/__preview/mode"><button name="mode" value="enabled">Enable fake sender</button><button name="mode" value="disabled">Disable sender</button><button name="mode" value="storage-failure">Simulate storage outage</button></form><ol>${rows}</ol></html>`, 'text/html; charset=utf-8'); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5);
      if (!['join', 'subscription'].includes(name)) { send(res, 404, '{}'); return; }
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 10000) { send(res, 413, '{}'); return; } chunks.push(c); }
      const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : null;
      if (name === 'join' && body?.email && !body.email.toLowerCase().endsWith('@example.com')) { send(res, 400, JSON.stringify({ error: 'Use an @example.com address in this synthetic preview.' })); return; }
      const result = await sandbox.call(name, body, { method: req.method, query: Object.fromEntries(url.searchParams), headers: { ...req.headers, 'x-vercel-forwarded-for': 'local-preview' } });
      res.writeHead(result.code, { 'Content-Type': 'application/json', ...result.headers }); res.end(JSON.stringify(result.body)); return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html'; else if (!extname(path)) path += '.html';
    if (!/^\/[a-zA-Z0-9_-]+\.(?:html|css|js)$/.test(path) && !/^\/assets\/[a-zA-Z0-9._/-]+$/.test(path)) { send(res, 404, '{}'); return; }
    const absolute = resolve(root, '.' + path);
    if (!absolute.startsWith(root + '/')) { send(res, 404, '{}'); return; }
    let content = await readFile(absolute);
    if (path.endsWith('.html')) content = Buffer.from(content.toString().replace('<body>', '<body><aside>ISOLATED PREVIEW — synthetic data and fake delivery. <a href="/__preview">Preview inbox &amp; controls</a></aside>'));
    if (['/email.html', '/confirm.html'].includes(path)) res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    send(res, 200, content, types[extname(path)] || 'application/octet-stream');
  } catch { send(res, 503, JSON.stringify({ error: 'Synthetic preview request failed' })); }
}).listen(Number((process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : undefined) || process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('A305X isolated email preview ready; no real emails or subscriber storage.'));
