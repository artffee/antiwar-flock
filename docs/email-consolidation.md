# A305X email consolidation — October 29, 2026

**Outcome:** one review branch; no production activation, no real messages,
no subscriber export/migration, no domain deletion, purchase or DNS change.
[Activation runbook](email-operations.md) is authoritative.

## Compared source revisions

| Source | Inspected revision | Use |
| --- | --- | --- |
| Current `main` | `e2c4217` | Base; retains newer SEO, structured metadata and opt-in Google Analytics work. |
| [PR #1](https://github.com/artffee/antiwar-flock/pull/1) | `ccfb4804cf78aeb4085c28c98b2aa9d248486275` | Integrated foundation; 37 changed files against its base. |
| [PR #2](https://github.com/artffee/antiwar-flock/pull/2) | `6d93bdb1fe2de052f39a1a7ae9bb79b82fa8a108` | Security behaviors ported deliberately; 21 changed files against its base. |
| Original common base | `ce1667e0ad21afe491385745fa82fbb57a71d6d6` | Both PRs predate current main. |

Overlapping files include signup HTML/JS, join API, store module, package inputs,
privacy, README, Vercel configuration, environment example, ignores and signup
tests. README/privacy conflicts were reconciled while retaining current analytics
privacy text. There is one subscriber module and one subscription API, not two
competing implementations. This PR supersedes both alternatives; neither old PR
was merged into main or closed by this task.

| Concern | Consolidated decision |
| --- | --- |
| Consent and preferences | PR #1's separate requested/verified interests and mailbox-authorized changes; add append-only prior confirmed-consent history. No legacy-topic promotion. |
| Confirmation | PR #1's signed, hash-at-rest, explicit-consent flow plus PR #2's strict one-use token, expiry-boundary and concurrent-consumption protections. |
| Private storage | PR #1's shared conditional store/journal plus PR #2's malformed-object/ETag checks and simultaneous-create recovery. Writes specify overwrite only with an ETag condition. |
| Unsubscribe | Retain PR #1's permanent suppression precedence; PR #2's token invalidation and verification reset. Keep old PR #2 opt-out tokens usable with original secret and stored nonce. |
| Delivery failures | PR #2's membership-safe generic responses; PR #1's durable lease, payload digest and idempotency journal. Recover an accepted send whose journal write failed. |
| Input/abuse checks | JSON-only 4 KiB body limit, same-origin and cross-site metadata checks, honeypot, trusted Vercel client-IP header, atomic limits and address cooldown. |
| Sender and preview | Explicit trusted HTTPS origin and sender/reply-to config, owner-designated test allowlist, separate preview token with same-store rejection. |
| Provider suppression | PR #1's raw-byte signed webhook, durable bounce/complaint/suppression and monotonic delivery ledger. Suppression removal never re-enrolls. |
| Marketing | Retain read-only preview, templates and approval design; hard-lock approval/test/send in source regardless of environment flags. |
| Frontend | Existing signup design; honest unavailable/error states; opt-out independent of sender; no signup/management analytics. |

## Current authorized external observations

Read-only Vercel inspection succeeded for the existing project and environment
metadata on October 29. The historical HTTP 403 is **not** the current blocker.
No environment variable values were decrypted or changed. The normal Blob token's
metadata binds store `store_eH5QFSTOF79Wt7kH` to Production, Preview and Development.
This explains why an ordinary hosted preview is not isolated. No subscriber file
or address was retrieved. Email configuration variable names were absent.

Resend `list_domains`, `get_usage`, `list_webhooks` and an existing-domain detail
read returned:

| Item | Current observed state |
| --- | --- |
| Domain capacity | 3 / 3 occupied |
| `ivosart.com` | failed; DKIM and return-path SPF/MX verification failed |
| `departmentofsurrender.com` | failed |
| `glagolic.com` | not_started |
| A305X sender | no registered/verified A305X domain |
| Webhooks | 0 |
| Sending limits | 100 daily / 3,000 monthly; checked with current account usage |
| Existing-domain tracking | disabled |

No currently verified sender is usable. Repairing an existing authorized domain
can avoid another domain slot, but using it for A305X needs the owner's explicit
sender-identity choice. Adding `mail.a305x.com` requires authorized capacity or a
separately authorized account/provider. No create/delete/upgrade was attempted.
Exact DNS records must come from the selected domain's current provider response;
we do not invent A305X verification records.

## Verification

- Clean dependency installation uses the checked-in lockfile, Node 24,
  `@vercel/blob` pinned to 2.8.2 and Svix 2.8.0.
- `npm test`: 51 tests pass, 0 failures. Includes all existing SEO, analytics,
  game and product/download regressions plus subscription/security checks.
- Native imports of join, subscription, webhook and launch API modules pass.
- `git diff --check` passes.
- A local isolated browser preview exercised the real handlers with synthetic
  Blob storage/provider: signup → pending; explicit confirmation → subscribed;
  preference change → saved; used-link replay → rejected; unsubscribe → durable
  suppression; sender disabled → signup hidden and address opt-out still works.
- No application-origin console errors were returned. Browser-extension metadata
  errors were separate from the site. Browser validation was desktop; actual
  mobile-device and provider-hosted email-client verification remain unperformed.
- Screenshots: [saved preferences](email-previews/consolidated-preferences-20261029.jpg)
  and [successful unsubscribe](email-previews/consolidated-unsubscribe-20261029.jpg).
- Test transport is simulated. No provider acceptance, recipient-server delivery,
  mailbox receipt, real Blob CAS operation or live webhook is claimed as verified.

No production command or subscriber-write tool was run. Push/PR creation may
trigger the project's normal protected Git preview, where email routes fail closed
until an explicitly separate preview store is configured. Existing production
remains on its prior revision.

## Remaining activation requirements

1. Review and merge only the consolidated implementation, preserving the existing
   production store and any previously used signing secrets.
2. Choose and verify an authorized sender within capacity; provider-issued DNS,
   disabled tracking, aligned authentication and a domain-scoped sending key.
3. Separate preview storage/secrets and verify real conditional storage operations.
4. Configure and prove signed delivery/suppression webhooks; reconcile existing
   provider suppressions without sending to them.
5. Owner-designated inbox; controlled preview acceptance + actual inbox receipt +
   confirmation/preferences/replay/opt-out test, followed by a production
   allowlisted smoke test. Only then authorize general confirmation delivery.
6. Marketing remains locked. Campaign activation is a separate reviewed task.
