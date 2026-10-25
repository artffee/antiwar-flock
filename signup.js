(() => {
  const forms = [...document.querySelectorAll('[data-email-form]')];
  const service = document.getElementById('signup-service');
  if (!forms.length || !service) return;
  const retry = document.getElementById('signup-retry');
  const interestSelect = document.getElementById('signup-interest');
  const selectedInterest = new URLSearchParams(location.search).get('interest');
  if (interestSelect && [...interestSelect.options].some((option) => option.value === selectedInterest)) {
    interestSelect.value = selectedInterest;
  }

  async function request(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/join', { ...options, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email sign-up is temporarily unavailable. Please try again later.');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkAvailability() {
    if (retry) { retry.hidden = true; retry.disabled = true; }
    service.textContent = 'Checking sign-up availability…';
    try {
      const data = await request();
      forms.forEach((form) => {
        form.hidden = form.dataset.emailForm === 'unsubscribe' ? data.unsubscribeAvailable !== true : data.available !== true;
      });
      service.hidden = data.available === true;
      if (!data.available) {
        service.textContent = 'New email confirmations are temporarily unavailable. You can still unsubscribe below. Please come back later to join.';
        if (retry) { retry.hidden = false; retry.disabled = false; }
      }
    } catch {
      service.textContent = 'Email sign-up is temporarily unavailable. Try again, or come back later. The free notebook and games are still available.';
      if (retry) { retry.hidden = false; retry.disabled = false; }
    }
  }
  retry?.addEventListener('click', checkAvailability);
  if (location.hash === '#leave') document.getElementById('leave').open = true;
  checkAvailability();

  forms.forEach((form) => {
    let busy = false;
    const status = form.querySelector('[role="status"]');
    const button = form.querySelector('button');
    const buttonLabel = button.innerHTML;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const action = form.dataset.emailForm;
      const interest = form.querySelector('[name="interest"]')?.value || 'all';
      busy = true;
      button.disabled = true;
      button.textContent = 'Saving…';
      form.setAttribute('aria-busy', 'true');
      status.textContent = '';
      try {
        const data = await request({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.querySelector('[name="email"]').value.trim(),
            consent: form.querySelector('[name="consent"]')?.checked === true,
            website: form.querySelector('[name="website"]')?.value || '',
            action,
            interest,
          }),
        });
        if (data.ok !== true) throw new Error('We could not confirm your request. Please try again.');
        status.dataset.error = 'false';
        status.textContent = action === 'subscribe'
          ? 'Check your inbox. If this request is eligible, a confirmation link will arrive. Confirm within 24 hours to activate your subscription or new interests. If it does not arrive, check spam and try again after one minute (up to three requests per hour).'
          : 'Your request is saved. If that address was on our list, it is now unsubscribed.';
        form.reset();
        if (action === 'subscribe') {
          if (interestSelect) interestSelect.value = interest;
          document.dispatchEvent(new CustomEvent('a305x:signup-requested', { detail: { interest } }));
        }
      } catch (error) {
        status.dataset.error = 'true';
        status.textContent = error.name === 'AbortError' || error instanceof TypeError
          ? 'We could not confirm your request. Check your connection and try again.'
          : error.message;
      } finally {
        busy = false;
        button.disabled = false;
        button.innerHTML = buttonLabel;
        form.removeAttribute('aria-busy');
        status.focus();
      }
    });
  });
})();
