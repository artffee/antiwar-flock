(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('token') || '';
  const action = params.get('action') === 'unsubscribe' ? 'unsubscribe' : 'confirm';
  // The bearer link stays out of HTTP requests, referrers, analytics, and persisted storage.
  history.replaceState(null, '', location.pathname);
  const button = document.getElementById('confirm-button');
  const status = document.getElementById('confirmation-status');
  if (!/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    status.textContent = 'This link is missing or invalid. Open the full link from your email, or request a new one.';
    return;
  }
  if (action === 'unsubscribe') {
    document.getElementById('confirmation-title').textContent = 'Leave the list.';
    document.getElementById('confirmation-description').textContent = 'Choose Unsubscribe to stop A305X updates and cancel pending confirmation requests.';
    button.textContent = 'Unsubscribe';
  }
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Saving your choice…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/confirm', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'We could not confirm your choice. Please try again.');
      status.textContent = action === 'unsubscribe'
        ? 'You are unsubscribed. Pending confirmation requests have been cancelled.'
        : 'Your email is confirmed. Your A305X subscription and saved interests are now active. Welcome to the fluck!';
      button.hidden = true;
    } catch (error) {
      status.textContent = error.name === 'AbortError' || error instanceof TypeError
        ? 'We could not check the result. Try again. If this link was already used successfully, your choice is saved.' : error.message;
      button.disabled = false;
    } finally {
      clearTimeout(timer);
      status.focus();
    }
  });
})();
