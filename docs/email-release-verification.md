# A305X email release verification

Inspection date: October 16, 2026 (America/New_York).
Repository baseline: `ce1667e0ad21afe491385745fa82fbb57a71d6d6` on `main`.

## Independent production observations before release

- `https://www.a305x.com/api/join` returned HTTP 200 with `available: true`.
  This is private-read connectivity, not an inventory, write test or email-delivery test.
- The public signup and privacy pages returned HTTP 200.
- Vercel project discovery matched the existing `antiwar-flock` project. Reading
  its project/environment configuration returned HTTP 403 for the project's team
  scope. The Vercel CLI fallback had no credentials; its login attempt was stopped.
  No production secret values were retrieved or changed.
- The authorized Resend account listed three sending domains. None was verified,
  A305X was absent, and the account had used all three available domain slots.
  No domain was deleted, no plan was changed, and no new domain was purchased.
- Resend listed zero configured webhooks. No webhook was created without its
  signing secret being installable in the intended production project.
- No production subscriber inventory was retrieved, exported or bulk migrated.
  Existing paths/store configuration are retained by the implementation.

## Implementation verification

All 29 automated tests passed after a clean `npm ci --ignore-scripts`. The automated suite exercises actual API modules with isolated, versioned private
storage and a simulated sending provider. It covers new/repeat registration,
legacy-field retention, explicit confirmation, token expiry/replay/purpose,
per-address and per-IP abuse limits, concurrent preference merges, unsubscribe
races and permanent suppression, storage failures, provider timeouts and
idempotent retries, authorized targeting, immutable approval audiences,
allowlisted single-recipient tests, signature verification, raw UTF-8 handling,
webhook replay, delivery status and failed/bounced/complained messages.

A local headless Chromium check at 390 px completed signup → pending record →
confirmation review → explicit opt-in → preference change → unsubscribe against
the real handlers and isolated fixture storage. It reported zero JavaScript
errors. Mobile layouts had no horizontal overflow. Confirmation and launch HTML
were rendered at 390 and 1100 px and inspected. A same-tab fragment-navigation
issue caught by this check was fixed before release. This is local browser and
simulated-provider evidence; it does not establish real mailbox receipt.

## Deployment and real delivery

Implementation source: `codex/a305x-confirmed-email` (see the pull request’s commit history).

Automatic approval review rejected a direct push to `main`, because it could
trigger a production deployment without explicit release approval. The changes
are being published on `codex/a305x-confirmed-email` as a draft pull request.
Production release remains pending the owner's approval.

The branch was published at implementation commit
`c30ca9540932ba6f9b1191fef10778b9ad7f9128` in draft
[PR #1](https://github.com/artffee/antiwar-flock/pull/1). GitHub's Vercel status was
`success`, and the Vercel bot reported this preview **Ready** at
2026-10-16 21:26:03 UTC:

https://antiwar-flock-git-codex-a305x-co-df3f2f-usivaylo-5363s-projects.vercel.app

Unauthenticated requests redirected to `https://vercel.com/login`, so their final
HTTP 200 responses were a Vercel login page, not application/API success. The
supported Vercel access tool also returned 403 at its protection-access step.
Consequently the preview build/deployment is confirmed Ready by GitHub/Vercel,
but deployed application behavior could not be tested with this connection.
Vercel deployment/configuration reads remain blocked by the same team scope.
No Deployment Protection setting was changed.

Real email receipt, provider-domain verification, production webhook receipt and
campaign dispatch have **not** been confirmed. Sending defaults off. No mass
mailing, legacy reconfirmation mailing, real test email or welcome message was
sent by this task. Owner-side activation requirements are in
[email-operations.md](email-operations.md).
