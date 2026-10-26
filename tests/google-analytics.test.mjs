import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../google-analytics.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../google-analytics-config.js', import.meta.url), 'utf8');
function setup(options = {}) {
  const nodes = [];
  const element = (tag) => {
    const node = { tag, children: [], style: {}, events: {}, appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener(name, fn) { this.events[name] = fn; }, focus() { this.focused = true; } };
    nodes.push(node); return node;
  };
  const storage = new Map();
  if (options.choice) storage.set('a305x-ga-consent-v1', JSON.stringify({ choice: options.choice, time: options.time ?? Date.now() }));
  const document = { head: element('head'), body: element('body'), createElement: element, cookie: '_ga=existing; _ga_TEST=existing', title: 'private@example.com' };
  const window = { A305X_GOOGLE_ANALYTICS: { enabled: true, measurementId: 'G-TEST12345', ...options.config } };
  const context = { window, document, location: { hostname: 'www.a305x.com', pathname: '/', search: '?email=private@example.com', hash: '#secret', ...options.location }, navigator: options.navigator || {}, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => { if (options.storageError) throw Error('blocked'); storage.set(k,v); } }, Date, Set, encodeURIComponent };
  vm.runInNewContext(source, context);
  return { window, document, nodes, storage, click: text => nodes.find(n => n.textContent === text).events.click(), scripts: () => document.head.children.filter(n => n.tag === 'script'), calls: () => (window.dataLayer || []).map(x => Array.from(x)) };
}
test('production config is inactive and has no invented measurement ID', () => {
  const context = { window: {} }; vm.runInNewContext(configSource, context);
  assert.equal(context.window.A305X_GOOGLE_ANALYTICS.enabled, false);
  assert.equal(context.window.A305X_GOOGLE_ANALYTICS.measurementId, '');
});
test('nothing loads or collects before explicit opt-in; decline stays local', () => {
  const env = setup(); assert.equal(env.scripts().length, 0); assert.equal(env.calls().length, 0);
  env.click('Decline analytics'); assert.equal(env.scripts().length, 0); assert.equal(env.calls().length, 0);
  assert.equal(JSON.parse(env.storage.get('a305x-ga-consent-v1')).choice, 'denied');
});
test('disabled, missing ID, private routes, unknown paths and preview hosts never initialize', () => {
  for (const options of [{ config: { enabled: false } }, { config: { measurementId: '' } }, { location: { pathname: '/f/secret' } }, { location: { pathname: '/flock' } }, { location: { pathname: '/signup' } }, { location: { pathname: '/other' } }, { location: { hostname: 'preview.vercel.app' } }]) {
    const env = setup({ ...options, choice: 'granted' }); assert.equal(env.scripts().length, 0); assert.equal(env.document.body.children.length, 0);
  }
});
test('privacy signals override stored consent', () => {
  for (const navigator of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    const env = setup({ navigator, choice: 'granted' }); assert.equal(env.scripts().length, 0); assert.equal(env.calls().length, 0); assert.equal(env.window['ga-disable-G-TEST12345'], true);
  }
});
test('opt-in sends only canonical public page, keeps ads denied, and avoids duplicates', () => {
  const env = setup(); env.click('Allow analytics');
  assert.equal(env.scripts().length, 1);
  const calls = env.calls(); const cfg = calls.find(x => x[0] === 'config')[2];
  assert.equal(cfg.send_page_view, false); assert.equal(cfg.allow_google_signals, false); assert.equal(cfg.allow_ad_personalization_signals, false);
  assert.equal(cfg.page_location, 'https://www.a305x.com/'); assert.equal(cfg.page_referrer, '');
  assert.equal(calls.find(x => x[0] === 'consent')[2].analytics_storage, 'denied');
  assert.equal(calls.find(x => x[0] === 'consent' && x[1] === 'update')[2].ad_storage, 'denied');
  assert.doesNotMatch(JSON.stringify(calls), /private@example|secret/);
  env.click('Allow analytics'); assert.equal(env.scripts().length, 1); assert.equal(env.calls().filter(x => x[0] === 'event').length, 1);
});
test('settings reopen, revoke disables collection and clears GA cookies', () => {
  const env = setup({ choice: 'granted' }); assert.equal(env.scripts().length, 1);
  env.click('Analytics settings'); assert.equal(env.nodes.find(x => x.tag === 'section').hidden, false);
  env.click('Decline analytics'); assert.equal(env.window['ga-disable-G-TEST12345'], true);
  assert.match(env.document.cookie, /Max-Age=0/);
  assert.equal(env.calls().at(-1)[2].analytics_storage, 'denied');
});
test('expired consent requires fresh choice; unavailable storage does not break opt-in', () => {
  const expired = setup({ choice: 'granted', time: 1 }); assert.equal(expired.scripts().length, 0);
  const blocked = setup({ storageError: true }); blocked.click('Allow analytics'); assert.equal(blocked.scripts().length, 1);
});
