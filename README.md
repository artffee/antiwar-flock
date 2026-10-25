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

The confirmed support email is `orionmind@gmail.com`. Final commerce policies are not yet supplied. Do not describe this prelaunch state as fully Stripe-ready or approved by Stripe.

## Take a Flucking Break

`/take-a-break` turns the original A305X flamingo ticket artwork into an interactive board. The five hanging tickets reveal 20 short, replayable challenges, with an optional 45–90 second timer, pause/resume, and a completion stamp. The timer pauses when the page is hidden. Ticket animations honor reduced-motion preferences; the completion count is only for the current page session. No signup or server storage is needed.

Run `node --test tests/take-a-break.test.mjs` for timer-state and ticket-deck checks.

The game board has separate paper-art flamingos and a UFO, with individual idle movement and a brief reaction for the chosen ticket. `flamingo-motion.js` clips the shared transparent atlas into character and prop layers; the original title and tickets remain visible beneath the scenery band. Visitors can pause the flamingos. Motion also stops offscreen, while a ticket dialog is open, when the tab is hidden, and for reduced-motion preferences. The complete original board is the fallback if animation assets cannot load.

## Deployment

No build step. Existing Vercel clean URLs are configured in `vercel.json`. Push the verified changes through the existing repository deployment pipeline. The connected production domain is `www.a305x.com`; `a305x.com` redirects to it. Vercel reported Valid Configuration for both on October 1, 2026.

## Flying Fluck journal

The approved “I Don’t Give a Flying Fluck” campaign appears on the homepage and store. `/flying-fluck` shows both covers, the 192-page PDF specifications, four journal themes, and a public 10-page preview at `/downloads/a305x-flying-fluck-preview.pdf`. The ad uses responsive WebP images and real links beneath the artwork. Release details are coming soon; the full notebook and companion are not public downloads. Keep them in the eventual digital delivery system until pricing, release availability, and fulfillment are confirmed.

The physical edition is explicitly in development. The digital page count includes
the front and back covers; its separate interior has 190 pages. The ad is a concept
mockup, not confirmation of a hardcover binding or finish. Printer, binding, stock,
physical trim, spine, price and fulfillment remain unconfirmed. Editable proof
sources, original artwork dimensions, and the printer release requirements are
documented in [production/flying-fluck](production/flying-fluck/README.md). The
sample now contains ten readable interior pages with mirrored margins and
standard PDF fonts for a small mobile download. The full interior proof retains
embedded DejaVu fonts. Covers are shown in the website gallery. Keep the full
PDFs outside the public website checkout.

## Email sign-up

`/signup` collects product-launch and art-update requests through `/api/join`. The request stays pending until the email owner uses a single-use confirmation link and presses the confirmation button. No customer accounts, passwords, or campaigns are added.

- Existing private Vercel Blob records under `emails/<sha256-normalized-email>.json` are retained in place, including unknown audit fields, previous consent, preferences and unsubscribe dates. No bulk migration or mail to old records occurs.
- New consent (wording/version/date) and selected interests are staged inside `confirmation`. Confirming consumes the token and activates those interests. Existing confirmed subscriptions stay active while additional preferences await confirmation. Previously captured, unverified addresses remain ineligible.
- Tokens use 256-bit random nonces and a server-only HMAC key; only their digest and non-secret nonce are stored. Confirmation expires after 24 hours. Delivery retries reconstruct the same message with the same provider idempotency key, within 23 hours of issuance. A fresh link invalidates the old link.
- `/confirm#token=…` keeps tokens out of request URLs. The isolated confirmation page has no analytics or third-party scripts, removes the fragment from browser history, and requires an explicit POST. GET requests and email scanners do not change state.
- Blob `ifMatch` conditional writes and create-only first writes make token consumption, rate limits, confirmation and unsubscribe transitions atomic. Unsubscribe clears pending tokens; stale writes cannot reactivate a subscription. Storage read errors propagate instead of being treated as an empty record.
- Both existing and unknown email addresses receive the same public signup/unsubscribe response. No API exposes subscriber records, token values, provider IDs, or membership. Confirmation failures combine expired, used, and invalid links.
- Requests are limited to five per IP per ten minutes, with separate subscribe/unsubscribe buckets. Confirmation sends have a one-minute cooldown and at most three attempts per address per hour; confirmation endpoints allow 30 requests per IP per ten minutes. Validation and the signup honeypot remain. Address limits and provider acceptance are not exposed to the browser.
- Resend is the prepared sender. Configure a verified domain and disable provider open/click tracking before enabling it. Acceptance is stored separately from actual delivery. Credentials are server-only environment variables; no credentials belong in this repository.
- Visitors can unsubscribe at `/signup#leave` or with the link in their confirmation email. Unknown-address requests create a suppression tombstone. Existing provider suppressions are never removed. Rejoining an unsubscribed address needs fresh consent and confirmation; bounce/complaint suppressions remain blocked.
- Sending is **off by default**. `GET /api/join` checks private storage and configuration without writing subscriber data. It reports separate signup and unsubscribe availability, so unsubscribe remains usable when sending is disabled. Configuration readiness is not a provider delivery test.
- Any future campaign must use `canReceiveMarketing()` from `api/_lib/subscriptions.js` **and** check current provider suppressions. No campaign/export/send-to-list implementation is included. Never use `status` or `emailVerified` alone as an eligibility test.

See [email activation and verification](docs/email-confirmation.md) for environment variables, deployment requirements, the live-test checklist, and the known activation blockers. `npm test` uses isolated storage and a fake provider; it does not send email or touch production subscribers.

## Not My Flucking Problem / The Daily Drama Dump

`/not-my-flucking-problem` is a separate, free digital notebook. The homepage and
store link directly to `/downloads/a305x-not-my-flucking-problem.pdf`: the complete
146-page PDF (front cover + 144 interior pages + back cover). No signup or checkout
is needed. `/downloads/a305x-not-my-flucking-problem-interior.pdf` provides the
144-page interior without covers for personal printing.

The notebook has 56 guided spreads, 280 session questions, four sections, reviews,
case logs, and 13 lined notes pages. PDF pages are 6 x 9 inches. The text is
searchable with embedded fonts and section bookmarks; use an annotation app for
digital writing. This is not a fillable form PDF. The public full file preserves
the original interior streams and compresses only the cover image encoding for a
small download. The approved cover mockup is served as responsive WebP images.

The free digital release does not open physical orders. Printer, stock, binding,
commercial cover bleed, spine, price, and fulfillment remain unconfirmed. Cover
artwork is for digital use and is not a printer-approved press master. Do not use
the older Flying Fluck page count or print profile for this notebook. Flying Fluck
and Field Manual 01 remain separate products with their existing release status.

Run `node --test tests/not-my-flucking-problem.test.mjs` for public download,
asset-link, and prelaunch checks.

## October 2026 experience refresh

- Homepage now focuses on three featured creations, the complete free notebook, a solo game, the artist story, and launch updates. All product details and existing downloads remain available.
- `/play` gathers all four games with accessible solo/friends filters. Old homepage deep links redirect to their replacement pages where needed. Coffee and scent concepts are retained in `/store#lab`.
- Consistent main navigation, keyboard-friendly menu dismissal, visible content without JavaScript, larger mobile tap targets, responsive collection cards, Open Graph metadata, sitemap, robots file, and a custom 404 page.
- Product links use `/signup?interest=tee` (also `flying-fluck`, `wall-art`, `chill-pill`, `field-manual`, `drama-dump`, or `all`). The form allows the visitor to change the selection. `/api/join` validates the fixed choice list and privately merges interests into the existing email record. Consent, subscription status, and legacy unverified-address status are retained. The confirmation flow now stages new preferences until the email owner confirms.
- `npm test` exercises the real join handler/storage against isolated in-memory storage; it does not create production subscribers. The suite includes repeated interests, invalid payloads, unsubscribe behavior, and storage-failure handling.

### Analytics activation remains an owner setting

`analytics-config.js` deliberately ships with `enabled: false` and `customEvents: false`. The current Vercel connection could read the project but returned a scope permission error for team settings. No analytics service was enabled and no paid plan was purchased.

To activate: enable Web Analytics in the existing `antiwar-flock` project dashboard, change `enabled` to `true`, update `/privacy` to describe the activated service, and deploy. Enable `customEvents` only after checking the project's plan supports them. Verify page views in the Vercel dashboard before reporting collection as active.

The prepared integration respects Do Not Track and Global Privacy Control, excludes Flock message routes, strips query strings/hash fragments from page URLs, and never sends email addresses or user-entered content. Optional custom events record PDF-link clicks (not completed downloads), launch-list clicks, game/experience opens (not completed game starts), and successful stored sign-ups. Product-interest records already work independently of analytics.

### Verification scope

Source tests and local link/asset checks are run before release. In the managed environment, the supported browser-preview skill was unavailable, so no local browser or device emulation was used. Live HTTP checks verify released pages and API readiness; full mobile visual QA and email delivery are separate checks. Marketing campaigns remain unimplemented; confirmation delivery requires the activation checks above.
