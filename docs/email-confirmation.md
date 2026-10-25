# A305X email confirmation: activation and verification

## Observed October 24, 2026

- The live `https://www.a305x.com/signup` page returned HTTP 200.
- The live `GET https://www.a305x.com/api/join` returned `{"available":true}` under the **old** implementation. This verifies that a private readiness read completed, not that sending is configured or that subscriber records were inspected.
- The GitHub source inspected started at `ce1667e` on `main`. The live signup response still reflected the old form, so source and production must be reconciled before release.
- Vercel found project `antiwar-flock`. Reading its environment-variable metadata returned HTTP 403 requiring authorization for the existing `usivaylo-5363s-projects` team. No secret values, production subscriber addresses, or counts were read.
- The connected Resend account listed three domains: `ivosart.com` and `departmentofsurrender.com` had status `failed`; `glagolic.com` had status `not_started`. No A305X domain was registered or verified.
- An attempt to prepare `mail.a305x.com` with sending enabled, receiving disabled, tracking disabled, and enforced TLS was rejected: **domain limit reached; upgrade required to add more**. No domain was created, no DNS was changed, no existing domain was removed, and no paid service was activated.
- Actual provider acceptance, inbox delivery, and live confirmation/unsubscribe have **not** been verified. Tests use a provider fake and private storage fake, including atomic conditional writes.

## Required configuration

Use the existing Vercel project and private Blob store. Never delete, overwrite with an empty collection, or publicly expose the existing `emails/` data. No migration is required. New fields are added when an individual explicitly signs up, confirms, or unsubscribes.

| Variable | Requirement |
| --- | --- |
| `EMAIL_CONFIRMATION_ENABLED` | `false` until activation is ready; `true` enables new confirmation requests. |
| `A305X_SITE_URL` | Explicit HTTPS origin, production `https://www.a305x.com`; never derive it from `Host`. Use the isolated preview origin in preview. |
| `A305X_EMAIL_FROM` | Bare address on the verified sender domain, e.g. `updates@mail.a305x.com` **only after** that domain is available and verified. |
| `A305X_EMAIL_REPLY_TO` | Monitored support inbox; existing public support address is `orionmind@gmail.com`. |
| `RESEND_API_KEY` | Sending-only key scoped to the verified domain; Vercel Secret. |
| `A305X_TOKEN_SECRET` | At least 32 random bytes encoded as base64url (43 characters); Vercel Secret, separate in preview and production. |
| Blob access | Keep the existing private store binding / SDK credentials. Preview requires separate private storage. |

Generate the token secret through a trusted secret-management process. Never print it in deployment logs, put it in a `VITE_` / `NEXT_PUBLIC_` variable, commit it, or paste it into an issue. Rotating this key invalidates old email links; the email-address unsubscribe form remains available.

Pinning `@vercel/blob` 2.8.2 and the lockfile ensures the `get().blob.etag` and conditional-write APIs used here are available. No additional database or paid queue is provisioned. Keep the existing Vercel project build settings (static site, no build step). API routes need Node.js with native fetch/AbortSignal support; `maxDuration` is set to 30 seconds.

## Sender setup

1. Resolve the existing provider domain-capacity limit without an unauthorized upgrade or removal. Options require the owner to choose an available verified sender arrangement, explicitly authorize a plan change, or use another authorized provider (which would require adapting the sender).
2. Add and verify the chosen A305X sending domain with the exact DNS records returned by Resend. Do not replace unrelated website or mailbox DNS records. Verify SPF and DKIM, and review the domain's DMARC policy.
3. Keep Resend open/click tracking disabled. This preserves fragment links and avoids tracking confirmation recipients. TLS should be enforced for the sender domain when available.
4. Use a sending-only domain-scoped API key. Do not use `onboarding@resend.dev` as a production sender. Do not remove any provider suppression to make a test pass.
5. Check the provider dashboard and plan limits before activation. Adding a sender to the code does not verify its domain, authorize a paid service, or demonstrate delivery.

## Controlled live acceptance test

Use addresses the owner explicitly designates and can inspect. A public support address alone is not a designation for tests. Do not send confirmation messages to the existing list or random addresses.

First use isolated preview storage and separately scoped secrets. If a Vercel preview requires login, arrange authorized preview access for the test recipient; do not bypass protection in application code.

| Step | Required evidence | Current result |
| --- | --- | --- |
| Production configuration | Authorized inspection of existing private storage binding and sender configuration | Blocked by Vercel team access |
| Sender verification | Resend reports the exact domain verified, tracking disabled | Blocked by domain capacity / verification |
| Request consent | Submit the actual form with designated test email and chosen product interest | Automated isolation tests pass; live pending |
| Provider acceptance | Request returns generic success; private record/provider dashboard has a message ID | Live pending |
| Delivery | Provider reports delivered, and recipient confirms the message arrived | Live pending; acceptance alone is insufficient |
| Link safety | Opening the email and link alone leaves subscription pending | Automated isolation tests pass; live pending |
| Confirm | Press button; record is verified/subscribed with consent and selected interests | Automated isolation tests pass; live pending |
| Retry/replay | Old/used/expired links give generic recovery; repeated signup respects cooldown | Automated isolation tests pass; live pending |
| Unsubscribe | Test page and email-link unsubscribe; old confirmation can no longer activate | Automated isolation tests pass; live pending |
| Rejoin | New consent + new confirmed link required; suppression history survives | Automated isolation tests pass; live pending |
| Mobile/browser rendering | Browser visual and interaction check | Pending: local browser executable unavailable; browser download failed |
| Production release | Verified preview, reviewed main commit, Vercel READY; repeat designated-address smoke test | Pending |

The public signup endpoint intentionally does not reveal delivery, membership or suppression status. Operators check private records and Resend logs for acceptance failures and actual delivery events. There is no background retry worker: uncertain sends retry once immediately with the same idempotency key; a later eligible user request retries the same message within 23 hours. After that, a fresh expiring link is generated. Never replay a confirmation by sending a campaign.

An in-flight provider request cannot be recalled when someone unsubscribes. Unsubscribing invalidates its confirmation token immediately; no delivered stale link can reactivate that record. Preserve local and provider suppression records on all later work.

## Rollout and rollback

- Merge/deploy only after reviewing the changes and validating the isolated live flow. No old record is automatically marked confirmed or sent a message.
- With email disabled, signup explains that confirmations are unavailable and keeps unsubscribe working while storage is healthy.
- To stop new confirmation sends, set `EMAIL_CONFIRMATION_ENABLED=false` and redeploy. Leave the token secret and private store intact so existing unsubscribe links and pending confirmation links continue to work. Do not roll back to the old unconditional-write subscriber implementation after activation.
- No marketing campaign has been implemented or sent. Before any campaign, add provider bounce/complaint synchronization and test the sender's eligibility filter against both local and provider suppressions. This is separate work from confirmation delivery.

## References

- [Vercel Blob SDK / conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
