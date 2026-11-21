(() => {
  const grid = document.querySelector('[data-shop-grid]');
  if (grid) {
    const controls = document.querySelector('[data-shop-tools]');
    const search = controls.querySelector('[data-shop-search]');
    const filters = [...controls.querySelectorAll('[data-filter]')];
    const cards = [...grid.querySelectorAll('[data-category]')];
    const count = document.querySelector('[data-shop-count]');
    const empty = document.querySelector('[data-shop-empty]');
    let active = 'all';

    function updateGrid() {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let matches = 0;
      for (const card of cards) {
        const text = [card.textContent, card.dataset.keywords, card.dataset.category].join(' ').toLowerCase();
        card.hidden = (active !== 'all' && card.dataset.category !== active) ||
          !words.every(word => text.includes(word));
        if (!card.hidden) matches++;
      }
      for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.filter === active));
      count.textContent = matches + (matches === 1 ? ' piece' : ' pieces');
      empty.hidden = matches > 0;
    }

    for (const button of filters) {
      button.addEventListener('click', () => {
        active = button.dataset.filter;
        updateGrid();
      });
    }
    search.addEventListener('input', updateGrid);
    document.querySelector('[data-shop-reset]').addEventListener('click', () => {
      active = 'all';
      search.value = '';
      updateGrid();
      search.focus();
    });
    controls.hidden = false;
    updateGrid();

    const stories = document.querySelector('.shop-stories');
    function openStory() {
      const target = document.getElementById(location.hash.slice(1));
      if (target && stories.contains(target) && !stories.open) {
        stories.open = true;
        target.scrollIntoView();
      }
    }
    window.addEventListener('hashchange', openStory);
    openStory();
  }

  const picker = document.querySelector('.print-picker');
  if (picker) {
    const choices = [...picker.querySelectorAll('a')];
    const panels = [...document.querySelectorAll('.print-panel')];
    function showDesign() {
      const current = panels.find(panel => '#' + panel.id === location.hash) || panels[0];
      for (const panel of panels) panel.hidden = panel !== current;
      for (const choice of choices) choice.setAttribute('aria-current', String(choice.hash === '#' + current.id));
    }

    for (const panel of panels) {
      const garment = panel.querySelector('[data-garment]');
      const print = panel.querySelector('[data-print-art]');
      const controls = panel.querySelector('.print-switch');
      const views = [...controls.querySelectorAll('[data-view]')];
      for (const view of views) {
        view.addEventListener('click', () => {
          const showPrint = view.dataset.view === 'art';
          garment.hidden = showPrint;
          print.hidden = !showPrint;
          for (const item of views) item.setAttribute('aria-pressed', String(item === view));
        });
      }
      controls.hidden = false;
    }
    for (const choice of choices) {
      choice.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        if (location.hash !== choice.hash) history.pushState(null, '', choice.hash);
        showDesign();
      });
    }
    window.addEventListener('popstate', showDesign);
    window.addEventListener('hashchange', showDesign);
    showDesign();
  }
})();
