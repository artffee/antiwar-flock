import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(resolve(root, name), 'utf8');
const page = read('not-my-flucking-problem.html');
const full = '/downloads/a305x-not-my-flucking-problem.pdf';
const interior = '/downloads/a305x-not-my-flucking-problem-interior.pdf';

test('The complete notebook downloads without a signup or checkout gate', () => {
  for (const name of ['index.html', 'store.html', 'not-my-flucking-problem.html']) {
    const html = read(name);
    assert.ok(html.includes(`href="${full}" download="A305X-Not-My-Flucking-Problem.pdf"`));
    assert.match(html, /146 PAGES|146-page PDF/);
  }
  assert.match(page, /NO SIGNUP NEEDED/);
  assert.ok(page.includes(`href="${interior}" download=`));
  assert.doesNotMatch(page, /data-checkout|buy\.stripe\.com|<form\b/);
  for (const file of [full, interior]) {
    const bytes = readFileSync(resolve(root, `.${file}`));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.subarray(-30).toString().includes('%%EOF'));
  }
});

test('Product links and responsive cover assets resolve', () => {
  for (const [, href] of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (href === '/' || href.startsWith('#') || href.startsWith('data:') || href.startsWith('https:')) continue;
    const path = href.split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
    assert.ok(existsSync(resolve(root, path)) || existsSync(resolve(root, `${path}.html`)), href);
  }
  for (const [, srcset] of page.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of srcset.split(',')) {
      assert.ok(existsSync(resolve(root, candidate.trim().split(' ')[0])));
    }
  }
  assert.match(page, /<img\b[^>]*alt="[^"]{40,}"/);
  assert.match(page, /width="1536" height="1024"/);
  assert.match(page, /href="#main"/);
  assert.match(page, /aria-controls="site-nav"/);
});

test('The new digital release keeps physical ordering closed and other notebooks separate', () => {
  assert.match(page, /No physical orders or preorders are being accepted/);
  assert.match(page, /not a printer-approved press file/);
  assert.match(page, /PHYSICAL BINDING AND FINISH ARE UNCONFIRMED/);
  assert.match(page, /href="\/flying-fluck"/);
  assert.match(page, /href="\/store#field-manual"/);
  assert.match(read('store.html'), /id="field-manual"/);
  const context = { window: {} };
  runInNewContext(read('store-config.js'), context);
  for (const product of Object.values(context.window.A305X_STORE.products)) {
    assert.equal(product.available, false);
    assert.equal(product.priceInCents, null);
    assert.equal(product.checkoutUrl, '');
  }
});
