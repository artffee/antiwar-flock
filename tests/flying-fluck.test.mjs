import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const page=read('flying-fluck.html');

test('Flying Fluck is a separate prelaunch product; physical sales stay closed',()=>{
  assert.match(page,/Physical edition in development/);
  assert.match(page,/No physical orders or preorders are being accepted/);
  assert.match(page,/190 interior pages; covers counted separately/);
  assert.match(page,/concept mockup; binding and finish are still to be selected/);
  assert.doesNotMatch(page,/data-checkout|buy\.stripe\.com|data-product=/);
  assert.match(read('store.html'),/id="field-manual"/);
  assert.match(read('store.html'),/I Don’t Give a Fuck: The Energy Edit/);
  const context={window:{}};
  runInNewContext(read('store-config.js'),context);
  for(const product of Object.values(context.window.A305X_STORE.products)){
    assert.equal(product.available,false);
    assert.equal(product.priceInCents,null);
    assert.equal(product.checkoutUrl,'');
  }
});

test('Product artwork is accessible, dimensioned and served from existing files',()=>{
  const tags=[...page.matchAll(/<img\b[^>]*>/g)].map(m=>m[0]);
  assert.equal(tags.length,2);
  for(const tag of tags){
    assert.match(tag,/alt="[^"]{40,}"/);
    assert.match(tag,/width="1024"/);assert.match(tag,/height="1536"/);
    const source=tag.match(/src="([^"]+)"/)[1];
    assert.ok(existsSync(resolve(root,source)),source);
  }
  assert.match(page,/href="#main"/);
  assert.match(page,/aria-controls="site-nav"/);
  assert.match(page,/<html lang="en"/);
});

test('Only the sample PDF is public; all product links resolve',()=>{
  const pdfLinks=[...page.matchAll(/href="([^"]+\.pdf)"/g)].map(m=>m[1]);
  assert.ok(pdfLinks.length>0);
  assert.ok(pdfLinks.every(p=>p==='/downloads/a305x-flying-fluck-preview.pdf'));
  for(const [_,href] of page.matchAll(/href="([^"]+)"/g)){
    if(!href.startsWith('/')&&!href.startsWith('./'))continue;
    const path=href.split('#')[0];
    if(path==='/')continue;
    assert.ok(existsSync(resolve(root,'.'+path))||existsSync(resolve(root,'.'+path+'.html'))||existsSync(resolve(root,path)),href);
  }
  assert.ok(readFileSync(resolve(root,'downloads/a305x-flying-fluck-preview.pdf')).subarray(0,5).equals(Buffer.from('%PDF-')));
});

test('Promotional artwork links to the journal; launch status is visible beside it',()=>{
  for(const name of ['index.html','store.html']){
    const html=read(name);
    assert.match(html,/journal-campaign-link" href="\/flying-fluck"/);
    assert.match(html,/Physical edition in development; no orders or preorders/);
    assert.match(html,/Image shows a concept mockup/);
    assert.match(html,/srcset="[^\"]*900w[^\"]*1672w/);
  }
});
