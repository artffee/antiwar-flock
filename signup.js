(() => {
  const forms = [...document.querySelectorAll('[data-email-form]')];
  const service = document.getElementById('signup-service');
  if (!forms.length || !service) return;

  async function request(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/join', { ...options, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email sign-up is temporarily unavailable. Please try again later.');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  request().then((data) => {
    if (data.available !== true) throw new Error('Unavailable');
    service.hidden = true;
    forms.forEach((form) => { form.hidden = false; });
  }).catch(() => {
    service.textContent = 'Email sign-up is temporarily unavailable. Please check back soon. You can still explore the art and games.';
  });

  forms.forEach((form) => {
    let busy = false;
    const status = form.querySelector('[role="status"]');
    const button = form.querySelector('button');
    const buttonLabel = button.innerHTML;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const action = form.dataset.emailForm;
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
          }),
        });
        if (data.ok !== true) throw new Error('We could not confirm your request. Please try again.');
        status.dataset.error = 'false';
        status.textContent = action === 'subscribe'
          ? 'You’re on the list. Thanks for joining the fluck!'
          : 'Your request is saved. If that address was on our list, it is now unsubscribed.';
        form.reset();
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
