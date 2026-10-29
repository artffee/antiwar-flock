(() => {
  window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });
  const parameters = new URLSearchParams(location.hash.slice(1));
  const mode = ['confirm', 'unsubscribe', 'preferences'].find((key) => parameters.has(key));
  const token = mode && parameters.get(mode);
  // Tokens stay out of analytics, referrers, cookies, and browser storage.
  if (location.hash) history.replaceState(null, '', location.pathname);
  const form = document.getElementById('email-form');
  const title = document.getElementById('title');
  const description = document.getElementById('description');
  const status = document.getElementById('status');
  const submit = document.getElementById('submit');
  const fieldset = document.getElementById('interests');
  const consent = document.getElementById('consent');
  const consentLabel = document.getElementById('consent-label');
  const inputs = [...fieldset.querySelectorAll('input')];
  let activeMode = mode;
  let activeToken = token;
  let busy = false;
  async function request(body) {
    const response = await fetch('/api/subscription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We could not save that change. Please try again.');
    return data;
  }
  function showError(error) {
    status.dataset.error = 'true';
    status.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'We could not confirm the change. Check your connection and try again.' : error.message;
    status.focus();
  }
  function selectInterests(interests) {
    inputs.forEach((input) => { input.checked = interests.includes(input.value) && (input.value === 'all' || !interests.includes('all')); });
  }
  inputs.forEach((input) => input.addEventListener('change', () => {
    if (input.checked) inputs.forEach((other) => { if (input.value === 'all' || other.value === 'all') { if (other !== input) other.checked = false; } });
  }));
  async function initialize() {
    if (!token) return;
    if (mode === 'unsubscribe') {
      title.textContent = 'Free to leave.';
      description.textContent = 'Stop all A305X product-launch and art updates for the address that received this link. No login required.';
      fieldset.hidden = true; consentLabel.hidden = true;
      submit.textContent = 'Unsubscribe from all updates';
      form.hidden = false;
      return;
    }
    status.textContent = 'Checking your secure link…';
    try {
      const data = await request({ action: mode === 'confirm' ? 'inspect' : 'preferences', token });
      if (data.alreadyConfirmed) {
        status.textContent = 'Your address is already confirmed. Use “Choose your interests” in a launch email to manage your topics.';
        return;
      }
      selectInterests(data.interests || []);
      description.textContent = mode === 'confirm' ? 'Confirm your address and choose what reaches your inbox. We only send launch updates after you confirm.' : 'Choose the topics you want. These choices replace your current email preferences.';
      consent.required = mode === 'confirm';
      consentLabel.hidden = mode !== 'confirm';
      submit.textContent = mode === 'confirm' ? 'Confirm my email ↗' : 'Save my interests ↗';
      status.textContent = '';
      form.hidden = false;
    } catch (error) { showError(error); }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const interests = inputs.filter((input) => input.checked).map((input) => input.value);
    if (activeMode !== 'unsubscribe' && !interests.length) return showError(new Error('Choose at least one interest, or use the unsubscribe link in your email.'));
    busy = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
    try {
      const data = await request({ action: activeMode, token: activeToken, interests, consent: consent.checked });
      status.dataset.error = 'false';
      if (activeMode === 'unsubscribe') {
        form.hidden = true;
        status.textContent = 'You’re unsubscribed. Your address is blocked from future A305X marketing and signup confirmations. Already dispatched email may still arrive.';
      } else {
        status.textContent = activeMode === 'confirm' ? 'You’re confirmed. Welcome to the fluck. Your selected interests are saved.' : 'Your interests are saved. Your inbox, your rules.';
        if (data.preferencesToken) { activeToken = data.preferencesToken; activeMode = 'preferences'; consentLabel.hidden = true; consent.required = false; submit.textContent = 'Save my interests ↗'; }
      }
      status.focus();
    } catch (error) { showError(error); }
    finally { busy = false; submit.disabled = false; form.removeAttribute('aria-busy'); }
  });
  initialize();
})();
