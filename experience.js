(() => {
  const filters = document.querySelector('.game-filters');
  const cards = [...document.querySelectorAll('[data-players]')];
  if (filters && cards.length) {
    filters.hidden = false;
    filters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      const filter = button.dataset.filter;
      filters.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      cards.forEach((card) => { card.hidden = filter !== 'all' && card.dataset.players !== filter; });
      document.getElementById('game-count').textContent = `${cards.filter((card) => !card.hidden).length} games shown.`;
    });
  }
  // Keep previously shared homepage links useful after moving sections.
  if (location.pathname === '/' || location.pathname === '/index.html') {
    const routes = {
      '#chill-pill': '/chill-pill', '#yesterday': '/play#yesterday',
      '#take-a-break': '/take-a-break', '#department': '/about#expanded-universe'
    };
    const followLegacyLink = () => { if (routes[location.hash]) location.replace(routes[location.hash]); };
    followLegacyLink();
    window.addEventListener('hashchange', followLegacyLink);
  }
})();
