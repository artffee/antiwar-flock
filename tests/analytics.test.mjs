import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../analytics-config.js', import.meta.url), 'utf8');

function setup(options = {}) {
  const scripts = [];
  const listeners = [];
  const window = { ...options.window };
  vm.runInNewContext(config, { window });
  Object.assign(window.A305X_ANALYTICS, options.config);
  const context = {
    window, URL, Set,
    navigator: options.navigator || {},
    location: { hostname: 'www.a305x.com', pathname: '/', ...options.location },
    document: {
      createElement: tag => ({ tag }),
      head: { appendChild: node => scripts.push(node) },
      addEventListener: (...args) => listeners.push(args)
    }
  };
  vm.runInNewContext(source, context);
  return { window, scripts, listeners, beforeSend: window.vaq?.find(call => call[0] === 'beforeSend')?.[1] };
}

test('public visits load the same-origin script without custom-event listeners', () => {
  const env = setup();
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, '/_vercel/insights/script.js');
  assert.equal(env.scripts[0].defer, true);
  assert.equal(typeof env.beforeSend, 'function');
  assert.equal(env.listeners.length, 0);
});

test('privacy signals and the disable switch prevent loading or queuing analytics', () => {
  for (const options of [
    { config: { enabled: false } },
    { navigator: { doNotTrack: '1' } },
    { navigator: { globalPrivacyControl: true } },
    { window: { doNotTrack: '1' } }
  ]) {
    const env = setup(options);
    assert.equal(env.scripts.length, 0);
    assert.equal(env.window.vaq, undefined);
    assert.equal(env.listeners.length, 0);
  }
});

test('signup, private messages, unknown paths and previews do not load analytics', () => {
  for (const pathname of ['/signup', '/signup.html', '/flock', '/flock.html', '/f/private-token', '/subscription', '/404', '/unknown']) {
    assert.equal(setup({ location: { pathname } }).scripts.length, 0, pathname);
  }
  assert.equal(setup({ location: { hostname: 'preview.vercel.app' } }).scripts.length, 0);
});

test('events redact query strings and fragments and reject non-public destinations', () => {
  const { beforeSend } = setup();
  const event = { type: 'pageview', url: 'https://www.a305x.com/store.html?email=private@example.com#private-token' };
  const result = beforeSend(event);
  assert.equal(result.url, 'https://www.a305x.com/store');
  assert.equal(result.type, 'pageview');
  assert.equal(event.url.includes('private@example.com'), true, 'does not mutate the input');
  for (const url of [
    'https://www.a305x.com/f/private-token',
    'https://www.a305x.com/signup?email=private@example.com',
    'https://www.a305x.com/unknown/private-token',
    'https://other.example/store',
    'http://www.a305x.com/store',
    'not a URL'
  ]) assert.equal(beforeSend({ type: 'pageview', url }), null, url);
});
