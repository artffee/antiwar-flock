import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const urls=[...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
test('sitemap pages have unique canonical metadata and valid linked structured data',()=>{
 assert.equal(new Set(urls).size,13);
 for(const url of urls){
  const path=new URL(url).pathname;const page=read(path==='/'?'index.html':path.slice(1)+'.html');
  assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(page.includes('href="'+url+'"'));
  assert.ok(page.includes('property="og:url" content="'+url+'"'));
  for(const name of ['title','description','image','image:alt'])assert.ok(page.includes('name="twitter:'+name+'"'),path+name);
  const schema=JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema['@context'],'https://schema.org');
  assert.equal(schema['@graph'].find(n=>n['@type']==='WebPage').url,url);
  const image=page.match(/property="og:image" content="([^"]+)"/)[1];
  assert.ok(existsSync(new URL('../'+new URL(image).pathname.slice(1),import.meta.url)));
  assert.ok(!page.includes('noindex'));
  assert.ok(page.includes('/google-analytics-config.js'));
 }
});
test('private shared messages and missing pages are excluded from indexing',()=>{
 for(const p of ['flock.html','404.html'])assert.match(read(p),/noindex/);
 assert.ok(!urls.some(u=>/\/flock|\/404|\/f\//.test(u)));
 assert.match(read('robots.txt'),/Sitemap: https:\/\/www.a305x.com\/sitemap.xml/);
});
