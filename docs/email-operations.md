# A305X consolidated subscription operations

This is the authoritative runbook for the October 29 consolidation of PRs #1 and #2.
**Delivery is off. Marketing campaigns are locked in code. This branch is for review, not production activation.**
See [comparison and verification evidence](email-consolidation.md).

## One subscription system

`/signup` → `/api/join` → private `emails/<sha256(normalized-email)>.json` →
Resend confirmation → `/email` → `/api/subscription`.

- An unchecked consent box, validated interest, JSON-only same-origin request,
  honeypot, five-per-ten-minute atomic IP limit, and three-per-hour address limit
  (60-second cooldown) precede confirmation. The IP is the Vercel-overwritten
  header, not a caller-provided forwarding chain.
- A signed, purpose-separated 24-hour token is consumed exactly once by explicit
  POST with consent and chosen interests. Link previews/GET never confirm or opt out.
  Used tokens cannot grant a preferences token. The expiry boundary is exclusive.
- Historical `interests` remain separate from owner-confirmed `verifiedInterests`.
  Legacy topics are not silently preselected or promoted into marketing eligibility.
  Authenticated preference changes append prior confirmed consent to the audit trail.
- Addresses, suppression, consent, dates, and unknown fields are preserved. There is
  no bulk migration, background reconfirmation, contact import, or scheduled sender.
  Legacy `status: subscribed` / `emailVerified` alone never establish consent.
- Cache-bypassing private reads require an object and ETag. Read/malformed-record
  failures stop the operation. Conditional writes and no-overwrite creation retry
  conflicts without erasing concurrent unsubscribe or complaint records.
- The send journal claims a lease and stores a payload digest. Retries reuse the
  same token, message and idempotency key for less than 23 hours. Ambiguous old or
  changed-payload jobs are held. A lost acceptance write can recover after the
  lease. Retries are user-request-driven; no queue drains the existing list.
- Provider failures, cooldown, existing membership and suppression have the same
  public response. It acknowledges the request, not delivery. Storage errors are
  errors, never successful saves. Operators must inspect private delivery journals.

## Unsubscribe and suppression

The address form works with sending disabled whenever storage is healthy. Signed
links require an explicit unsubscribe button; RFC 8058 email-client POST requires
no extra confirmation and bypasses shared-IP limits. Opt-out clears pending
confirmation and verification, preserves historical consent/preferences, and keeps
a permanent suppression tombstone even for previously unknown addresses.

Bounced, complained, manually suppressed, and unsubscribed addresses cannot rejoin
through the public form. This intentionally keeps PR #1's stronger policy over
PR #2's public rejoin behavior. No path clears suppression automatically.
An already dispatched message cannot be recalled, but its pending link is invalidated.

PR #1 links use the retained `EMAIL_TOKEN_SECRET`. If PR #2 ever issued links, retain
its **original** `A305X_TOKEN_SECRET` for unsubscribe-only compatibility; its stored
`unsubscribeNonce` must match atomically. `/confirm` forwards an old unsubscribe
link to the explicit button on `/email`. Old confirmation tokens are never accepted
as new proof of consent; that page offers recovery and the email-address opt-out.
Do not rotate secrets during consolidation. An old PR #2 confirmed record is kept,
but historical merged interests are not silently converted to `verifiedInterests`.

`/api/email-webhook` verifies exact raw bytes, Svix signature and timestamp before
processing `email.sent`, `email.delivery_delayed`, `email.delivered`, `email.failed`,
`email.bounced`, `email.complained`, `email.suppressed`, and `suppression.added`.
It acknowledges only durable results, deduplicates events, and prevents late events
from downgrading suppression. `suppression.removed` never removes the local block.
Before live sending, reconcile existing provider suppressions without contacting
those addresses or clearing any provider entry.

## Configuration (all secret values stay outside Git)

Use [.env.example](../.env.example). PR #2's enabling variables are not aliases:
`EMAIL_CONFIRMATION_ENABLED`, `A305X_EMAIL_FROM`, `A305X_EMAIL_REPLY_TO`, and
`A305X_SITE_URL` cannot enable a second system. Only the optional old unsubscribe
secret remains supported.

| Variable | Required behavior |
| --- | --- |
| `EMAIL_ENABLED` | Defaults off. Set true only for the controlled test/release stage below. |
| `EMAIL_DELIVERY_MODE` | `off` initially; `test` allows only designated inboxes; `live` is rejected outside Vercel Production. |
| `EMAIL_SITE_URL` | Explicit HTTPS origin. Production: `https://www.a305x.com`. Preview must use its own host. No paths, credentials, queries or fragments; never derived from a request. |
| `EMAIL_FROM` | Exact `A305X <address@verified-domain>` identity, approved by owner. |
| `EMAIL_SENDER_DOMAIN` | Exact domain part of From, after provider verification. Supports an explicitly approved existing sender domain; never chosen automatically. |
| `EMAIL_REPLY_TO` | Monitored support inbox. Existing public support: `orionmind@gmail.com`. |
| `RESEND_API_KEY` | Sending-only key scoped to the verified sender domain. |
| `EMAIL_TOKEN_SECRET` | Independent random secret of at least 32 bytes; preserve if already used. Separate preview/production values. |
| `RESEND_WEBHOOK_SECRET` | Secret for the correct environment's signed event endpoint. |
| `EMAIL_TEST_RECIPIENTS` | Comma-separated inboxes explicitly designated by owner; no support address is assumed to be a test recipient. |
| Production Blob | Preserve the current private store/binding. No empty replacement store or subscriber export. |
| `EMAIL_PREVIEW_BLOB_READ_WRITE_TOKEN` | A different private store for Preview. Email routes reject inherited Production credentials and another key for that same store. |
| `EMAIL_MARKETING_ENABLED` | Keep false. Even true cannot bypass this release's `CAMPAIGNS_RELEASED=false` lock. |
| `EMAIL_ADMIN_SECRET` | Optional separate 32+ character secret for read-only campaign audience/render previews and status. |
| `EMAIL_POSTAL_ADDRESS` | Future owner-approved business mailing address, not a private address inferred from context. Does not unlock campaigns. |
| `A305X_TOKEN_SECRET` | Optional original PR #2 secret for old unsubscribe links only. |

No application flag proves DNS verification or successful delivery. The operator
must gather the evidence below before changing delivery mode. No secrets were set
in Vercel, no provider key was created, and no domain or DNS was altered in this task.

## Exact activation sequence

1. **Review and source:** review this consolidated PR instead of merging #1 and #2
   independently. Preserve current main's SEO and opt-in analytics changes. Confirm
   the actual release commit and existing Vercel project `antiwar-flock` in
   `usivaylo-5363s-projects` (`prj_xb2Q7jgqxXY5Q1FXR4ZEzN6u9OYg`).
2. **Sender decision and verification:** account capacity is currently 3/3 and none
   of the domains is verified. Either repair an existing authorized domain (e.g.
   `ivosart.com`) and obtain explicit approval for that From identity, or obtain
   approval for additional capacity/an authorized separate provider account to
   register `mail.a305x.com`. Another provider requires a reviewed adapter. Do not
   delete existing domains, buy a plan, or use `onboarding@resend.dev` for launch.
   Publish only the exact provider-issued DKIM and return-path SPF/MX records;
   preserve unrelated DNS, verify DMARC alignment, and confirm Resend says verified.
   Keep open/click tracking disabled. Review TLS policy for the selected sender.
3. **Private storage and environment:** Vercel metadata access now succeeds. Its
   normal Blob token is scoped to Production, Preview and Development. Keep the
   Production store intact. Provision/bind separate private preview storage and
   separately scoped secrets; this code will otherwise disable email preview APIs.
   Validate actual private reads and conditional writes with synthetic records in
   that test store, including stale-ETag and simultaneous-create conflicts. Do not
   read/copy real subscribers into the preview. Retain deployment protection.
4. **Provider events:** create/configure the signed webhook on a permitted endpoint,
   install its secret in the matching environment, and verify actual durable signed
   events including delivery, suppression, duplicate/reordered events and failed
   persistence retries. The account currently has **zero webhooks**. If preview
   protection prevents provider callbacks, arrange a narrowly authorized test
   endpoint/access path; do not disable project protection globally.
5. **Controlled live test:** owner designates an inbox and can inspect it. In
   isolated preview set `EMAIL_DELIVERY_MODE=test`, that exact allowlist, the
   verified sender configuration and `EMAIL_ENABLED=true`. Submit the real form,
   record provider acceptance ID, observe signed delivery, and confirm inbox receipt.
   Opening the email/link must leave it pending. Then press Confirm, verify only
   selected interests, reject a used/expired token, change preferences, unsubscribe
   by link and address, test one-click POST, and verify fresh signup cannot clear
   suppression. Check browser and mobile layouts. Never use legacy addresses.
6. **Production controlled smoke test:** after review, sender verification, project
   access and the isolated live test succeed, deploy the reviewed revision with
   the existing Production store and `EMAIL_DELIVERY_MODE=test`. Only the approved
   mailbox may receive a confirmation. Repeat acceptance + signed delivery + inbox
   receipt + confirmation + unsubscribe on the actual production host. Test-only
   mode is not general activation; public submissions outside the allowlist send
   nothing and are not enrolled.
7. **General confirmations:** only after both controlled tests pass may the owner
   authorize `EMAIL_DELIVERY_MODE=live` with `EMAIL_ENABLED=true`. Keep campaigns
   locked and `EMAIL_MARKETING_ENABLED=false`. Monitor private send failures and
   webhook retries. Deployment/HTTP 200/provider acceptance alone is insufficient.

## Campaigns stay disabled

PR #1's templates, read-only audience/rendering previews, fixed-recipient manifests,
content/audience digests and approval machinery remain for review. The `approve`,
`test` and `send` actions all fail closed, including direct calls to the provider
boundary for non-confirmation mail. No environment variable unlocks this release.
Any future campaign requires a separate reviewed code change, provider suppression
reconciliation, approved business mailing address, exact content/audience approval,
allowlisted tests and delivery verification. Do not run a launch to test signup.

## Local verification and rollback

`npm ci && npm test` runs real route/lifecycle code against fake conditional private
storage and a fake provider. `npm run dev` starts the isolated preview server;
`/__preview` shows synthetic outbox/state and sender/outage controls. It accepts
only `@example.com` input and exposes no host credentials to its VM. On the managed
preview service use `sites-preview start <checkout>`. `scripts/` and `tests/` are
excluded by `.vercelignore`; the sandbox must never be deployed as production.

To stop confirmations, set `EMAIL_ENABLED=false` or `EMAIL_DELIVERY_MODE=off` and
redeploy. Keep the store and token secrets: opt-out and existing proof validation
continue while storage is healthy. Do not roll back to the old unconditional-write
subscription handler; that would risk losing suppression under concurrency.

## Primary references

- [Vercel private Blob SDK and conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Vercel trusted request headers](https://vercel.com/docs/headers/request-headers)
- [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
- [Resend free domain capacity](https://resend.com/changelog/three-domains-on-the-free-tier)
