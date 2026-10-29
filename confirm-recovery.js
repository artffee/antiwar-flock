// PR #2 used a different token secret and format. Never reinterpret those
// tokens as proof of consent in the consolidated system.
const oldLink = new URLSearchParams(location.hash.slice(1));
const oldToken = oldLink.get('token');
if (location.hash || location.search) history.replaceState(null, '', location.pathname);
if (oldLink.get('action') === 'unsubscribe' && /^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(oldToken || '')) {
  // Only opens the explicit unsubscribe button; navigation never changes data.
  location.replace('/email#unsubscribe=' + encodeURIComponent(oldToken));
}
