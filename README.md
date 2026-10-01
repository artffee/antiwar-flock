# A305X — Born to Disobey

Existing A305X website, deployed from this repository to Vercel. Static HTML/CSS/JavaScript plus the existing optional serverless endpoints. Preserve the artwork and games when updating the store.

## Store and Stripe

The shop lives at `/store`. It is currently a prelaunch collection, not an active checkout. Do not invent product prices, availability, contact details, or delivery/return promises.

Public settings live in `store-config.js`. Before enabling a product:

1. Confirm a working customer support email with the owner.
2. Confirm price in USD, final product specifications, available size options, stock, and fulfillment.
3. Write the owner's approved shipping and returns/cancellations policies into the config. Include destinations, costs, processing and delivery estimates, return window, eligibility, process, and who pays return shipping.
4. Create the corresponding **live Stripe Payment Link** with the same price, variants or required size choice, shipping collection, and applicable tax/shipping settings. Configure receipt/support details and policy URLs in Stripe. Verify them there before publishing.
5. Set the product's price in cents, final details, live `https://buy.stripe.com/...` URL, and `available: true`.

The storefront intentionally keeps checkout closed if a product or any required customer information is missing. Only a valid Stripe-hosted HTTPS URL is accepted. A Payment Link is public; never commit secret API keys or card data. This is checkout-link preparation, not an implemented order-fulfillment integration. Stripe amount and variant setup must be checked against the website manually.

## Customer pages

- `/about`: artist/brand description and current anti-war/fundraising clarification.
- `/store-info`: ordering, support, shipping, returns, and product FAQs. Contact and policies are populated from the public store config when confirmed.
- `/privacy`: current technical data practices, optional submissions, and browser storage. Update when collection or service providers change.
- `/terms`: website-use terms, artwork and printable permissions, submitted content, current order status, and consumer-rights preservation. Review and update before opening sales; it does not replace the final shipping, returns, and cancellation policies.

Support details and final commerce policies are not yet supplied. Do not describe this prelaunch state as fully Stripe-ready or approved by Stripe.

## Deployment

No build step. Existing Vercel clean URLs are configured in `vercel.json`. Push the verified changes through the existing repository deployment pipeline. The custom-domain DNS/assignment must separately point `a305x.com` at this project; a successful Vercel deployment does not verify that domain mapping.
