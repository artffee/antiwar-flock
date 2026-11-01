(() => {
  const config = window.A305X_ANALYTICS || {};
  if (!config.enabled || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const hosts = new Set(['a305x.com', 'www.a305x.com']);
  const pages = new Set(['/', '/store', '/play', '/about', '/not-my-flucking-problem', '/flying-fluck', '/chill-pill', '/take-a-break', '/vote-for-yesterday', '/store-info', '/privacy', '/terms']);
  const publicPath = path => path.replace(/\.html$/, '') || '/';
  // Measure only known public pages, never signup, shared messages or token routes.
  if (!hosts.has(location.hostname) || !pages.has(publicPath(location.pathname))) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', (event) => {
    try {
      const url = new URL(event.url);
      const path = publicPath(url.pathname);
      if (url.protocol !== 'https:' || !hosts.has(url.hostname) || !pages.has(path)) return null;
      url.pathname = path;
      url.search = '';
      url.hash = '';
      return { ...event, url: url.href };
    } catch {
      return null;
    }
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
  if (!config.customEvents) return;
  const track = (name, data) => window.va('event', { name, data });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (/\.pdf$/i.test(url.pathname) && url.origin === location.origin) {
      track('Download click', { file: url.pathname });
    } else if (url.pathname === '/signup' && url.origin === location.origin) {
      const allowed = ['all', 'tee', 'wall-art', 'flying-fluck', 'chill-pill', 'field-manual', 'drama-dump'];
      const interest = url.searchParams.get('interest');
      track('Launch list click', { interest: allowed.includes(interest) ? interest : 'all' });
    } else if (['/take-a-break', '/vote-for-yesterday', '/chill-pill'].includes(url.pathname) || url.hostname === 'fluck-the-system-a305x.captainnemo007.chatgpt.site') {
      track('Game or experience open', { game: url.hostname === location.hostname ? url.pathname : 'fluck-the-system' });
    }
  });
  document.addEventListener('a305x:subscribed', (event) => {
    track('Email signup saved', { interest: event.detail.interest });
  });
})();
