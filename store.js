(() => {
  const config = window.A305X_STORE || {};
  const email = typeof config.supportEmail === "string" ? config.supportEmail.trim() : "";
  const hasEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n?]/.test(email);
  const hasText = value => typeof value === "string" && value.trim().length > 0;

  if (hasEmail) {
    document.querySelectorAll("[data-support-email]").forEach(link => {
      link.textContent = email;
      link.href = `mailto:${email}`;
    });
    document.querySelectorAll("[data-support-ready]").forEach(node => { node.hidden = false; });
    document.querySelectorAll("[data-support-pending]").forEach(node => { node.hidden = true; });
  }

  for (const [key, selector] of [["shippingPolicy", "[data-shipping-policy]"], ["returnsPolicy", "[data-returns-policy]"]]) {
    if (hasText(config[key])) {
      document.querySelectorAll(selector).forEach(node => { node.textContent = config[key].trim(); });
    }
  }

  let checkoutAvailable = false;
  for (const [id, product] of Object.entries(config.products || {})) {
    let validLink = false;
    try {
      const url = new URL(product.checkoutUrl);
      validLink = url.protocol === "https:" && url.hostname === "buy.stripe.com" &&
        !url.username && !url.password && !url.port && /^\/[A-Za-z0-9]+$/.test(url.pathname);
    } catch { /* An unconfigured link must never become a checkout button. */ }
    const ready = product.available === true && validLink && hasEmail &&
      Number.isSafeInteger(product.priceInCents) && product.priceInCents > 0 &&
      product.currency === "USD" && hasText(product.details) &&
      hasText(config.shippingPolicy) && hasText(config.returnsPolicy);
    if (!ready) continue;
    checkoutAvailable = true;
    const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
      .format(product.priceInCents / 100);
    document.querySelectorAll("[data-product]").forEach(card => {
      if (card.dataset.product !== id) return;
      card.querySelectorAll("[data-product-status]").forEach(node => { node.textContent = "Available now"; });
      card.querySelectorAll("[data-product-details]").forEach(node => { node.textContent = product.details.trim(); });
      card.querySelectorAll("[data-product-price]").forEach(node => { node.textContent = `${price} USD`; });
      card.querySelectorAll("[data-product-pending]").forEach(node => { node.hidden = true; });
      card.querySelectorAll("[data-checkout]").forEach(link => {
        link.href = product.checkoutUrl;
        link.textContent = `Buy with Stripe · ${price} USD`;
        link.hidden = false;
      });
    });
  }
  if (checkoutAvailable) {
    document.querySelectorAll("[data-store-prelaunch]").forEach(node => { node.hidden = true; });
    document.querySelectorAll("[data-store-open]").forEach(node => { node.hidden = false; });
  }
})();
