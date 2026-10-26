(() => {
  'use strict';
  const config = window.A305X_GOOGLE_ANALYTICS || {};
  const id = config.measurementId || '';
  const pages = new Set(['/', '/store', '/play', '/about', '/not-my-flucking-problem', '/flying-fluck', '/chill-pill', '/take-a-break', '/vote-for-yesterday', '/store-info', '/privacy', '/terms']);
  const path = location.pathname.replace(/\.html$/, '') || '/';
  if (!config.enabled || !/^G-[A-Z0-9]{6,}$/.test(id)) return;
  if (!['www.a305x.com', 'a305x.com'].includes(location.hostname) || !pages.has(path)) return;
  const blocked = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const key = 'a305x-ga-consent-v1';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const disableKey = 'ga-disable-' + id;
  let loaded = false;
  let sent = false;
  window[disableKey] = true;
  const readChoice = () => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && ['granted', 'denied'].includes(value.choice) && value.time <= Date.now() && Date.now() - value.time < maxAge ? value.choice : null;
    } catch { return null; }
  };
  const remember = (choice) => {
    try { localStorage.setItem(key, JSON.stringify({ choice, time: Date.now() })); } catch { /* Session-only when storage is unavailable. */ }
  };
  const clearCookies = () => {
    for (const item of document.cookie.split(';')) {
      const name = item.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; domain=' + location.hostname, '; domain=.a305x.com', '; domain=a305x.com']) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + domain;
      }
    }
  };
  const deny = () => {
    window[disableKey] = true;
    if (loaded) window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    clearCookies();
  };
  if (blocked) { deny(); return; }
  const grant = () => {
    window[disableKey] = false;
    if (!loaded) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      window.gtag('set', 'ads_data_redaction', true);
      window.gtag('set', 'url_passthrough', false);
      window.gtag('js', new Date());
      loaded = true;
    }
    window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    if (!sent) {
      // Only canonical, allowlisted public pages; never use document.title,
      // location.search/hash, referrer, link contents or form/event values.
      window.gtag('config', id, {
        send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, ignore_referrer: true,
        page_location: 'https://www.a305x.com' + path,
        page_referrer: '', page_title: path === '/' ? 'A305X' : 'A305X ' + path.slice(1),
        cookie_expires: 15552000, cookie_update: false
      });
      window.gtag('event', 'page_view', {
        send_to: id, page_location: 'https://www.a305x.com' + path,
        page_referrer: '', page_title: path === '/' ? 'A305X' : 'A305X ' + path.slice(1)
      });
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      document.head.appendChild(script);
      sent = true;
    }
  };
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Optional analytics');
  panel.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;padding:20px;background:#fff;color:#151515;border:2px solid #151515;box-shadow:0 4px 24px #0003;z-index:10000;font:16px/1.5 system-ui';
  const text = document.createElement('p');
  text.textContent = 'Allow optional Google Analytics cookies to measure visits to public A305X pages? No advertising tracking. You can decline and use the site normally, or change your choice anytime.';
  panel.appendChild(text);
  const button = (label, handler) => {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.style.cssText = 'font:inherit;padding:10px 14px;margin:4px;cursor:pointer;background:#fff;color:#151515;border:2px solid #151515;min-height:44px';
    element.addEventListener('click', handler); return element;
  };
  const settings = button('Analytics settings', () => { panel.hidden = false; decline.focus(); });
  settings.style.cssText += ';position:fixed;bottom:8px;right:8px;z-index:9999;font-size:12px';
  const decline = button('Decline analytics', () => { remember('denied'); deny(); panel.hidden = true; settings.focus(); });
  const accept = button('Allow analytics', () => { remember('granted'); grant(); panel.hidden = true; settings.focus(); });
  const privacy = document.createElement('a'); privacy.href = '/privacy'; privacy.textContent = 'Privacy details'; privacy.style.cssText = 'color:#151515;margin:8px';
  panel.appendChild(decline); panel.appendChild(accept); panel.appendChild(privacy);
  document.body.appendChild(settings); document.body.appendChild(panel);
  const choice = readChoice(); panel.hidden = choice !== null;
  if (choice === 'granted') grant(); else if (choice === 'denied') deny();
})();
