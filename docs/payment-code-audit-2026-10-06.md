# MediScribe code and payment audit — October 6, 2026

**Recommendation: fix the critical payment-security issues before treating this as a release-ready build.** A reachable checkout and enabled webhook do not establish correct accounting or secure entitlement issuance.

The audit covered the local backend, checkout/authentication and subscriber UI, payment/reporting scripts, Electron entitlement enforcement and sign-in, database configuration, and release workflows. GitHub `main` and local HEAD both resolve to `c7e18842db56afe0567d34ea6feb649d30131449`. The working tree contains substantial unreleased changes: `server/`, the new billing/security modules and tests are untracked, and many tracked client/workflow files are modified. Therefore, GitHub main, the current local app, and the deployed backend are different deliverables. This report primarily evaluates the current local implementation and explicitly identifies deployed configuration findings.

No product code, production records, payments, refunds, credentials, database permissions or releases were changed during this audit. Only this report was added. Cloud checks were read-only; reproductions used synthetic data. All 77 existing tests, TypeScript, lint and client security checks pass; this does not cover the defects below. Native installers and a real or provider-test-mode purchase/refund were not tested.

**P0 means urgent security remediation; P1 means fix before release; P2 means a correctness or operational improvement.**

## 1. P0 — Production users can modify the billing fields the backend signs

Read-only inspection of the active Firestore rules found the July 15 ruleset still permits an authenticated user to read and write their entire `users/{uid}` document. The stricter local rules have not been deployed. Meanwhile, [account()](/Users/kalpa/Documents/Mediscribe/server/billing.js:46) returns any record with `billingVersion === 2`, and [signEntitlement()](/Users/kalpa/Documents/Mediscribe/server/billing.js:18) trusts its activation and expiry fields.

A customer can therefore alter their own paid status/expiry and obtain a genuine server-signed entitlement without a purchase. The isolated reproduction used zero payment ledger entries and received a valid signature for active yearly access expiring in 2099. No production account was altered. Clients can also delete or corrupt their user record, undermining subsequent fulfillment.

**Fix:** make billing/entitlement records server-owned and deploy corresponding rules through a coordinated legacy-client cutover. Prefer separate protected billing documents rather than sharing a writable profile. Audit/rebuild existing version-2 entitlements against verified payment records; merely stopping future writes leaves any prior forged data intact. Add emulator tests for forbidden client writes and tests that entitlements cannot be signed from arbitrary profile fields. The server must not rely solely on an untrusted `billingVersion` marker.

References: [server/billing.js:49](/Users/kalpa/Documents/Mediscribe/server/billing.js:49), [server/billing.js:19](/Users/kalpa/Documents/Mediscribe/server/billing.js:19), [local rules](/Users/kalpa/Documents/Mediscribe/firestore.rules:5). Server SDK access bypasses client rules, so restricting client writes is compatible with backend writes: [Firebase rules documentation](https://firebase.google.com/docs/firestore/security/rules-query).

## 2. P0 — The configured merchant secret remains in committed source

The literal fallback in [scripts/list-subscribers.js:33](/Users/kalpa/Documents/Mediscribe/scripts/list-subscribers.js:33) matches the merchant secret configured in local `.env`. The same value is present in Git HEAD's `electron/main.js` as well. Remote HEAD equals local HEAD. Only equality booleans and line locations were printed; the credential value is deliberately omitted here. Current cloud-key validity/rotation was not tested in this audit.

**Fix:** treat this credential as exposed, rotate/revoke it at Razorpay in a controlled backend update, and remove literal fallbacks. Review prior distributed installers and repository history for the old secret. History cleanup alone cannot undo exposure. Scan the entire tracked repository and built artifacts, not just Electron JavaScript: the current [security check](/Users/kalpa/Documents/Mediscribe/scripts/check-client-security.js:9) misses this reporting script.

## 3. P1 — A refund arriving before capture persistence can disappear

[revoke()](/Users/kalpa/Documents/Mediscribe/server/billing.js:100) returns successfully when no payment document exists. A concurrent capture handler may already have fetched a captured provider snapshot but not committed it. The refund handler then acknowledges the refund without retaining anything, and the capture handler subsequently writes a captured payment and grants access.

The synthetic reproduction ended with provider status `refunded`, local status `captured`, and active Pro access. If refund is processed first without that race, later fulfillment rejects the refunded provider record, leaving the payment/refund absent from the local ledger instead.

**Fix:** persist a refund tombstone or event even when capture is unknown; apply monotonically advancing payment states within the transaction. Store the webhook event ID, provider refund ID, amounts and timestamps. Capture processing must check recorded refunds before granting access. Add out-of-order and concurrent-event tests. Razorpay explicitly documents duplicate and out-of-order delivery: [webhook best practices](https://razorpay.com/docs/webhooks/best-practices/).

References: [server/billing.js:103](/Users/kalpa/Documents/Mediscribe/server/billing.js:103), [server/billing.js:82](/Users/kalpa/Documents/Mediscribe/server/billing.js:82), [server/index.js:150](/Users/kalpa/Documents/Mediscribe/server/index.js:150).

## 4. P1 — Reconciliation cannot repair a missed refund

Both reconciliation routes call `fulfill()`. Its validation rejects a provider payment with any refunded amount before updating local state. If a refund webhook is missed, reconciliation returns 409 while the previously captured record and paid entitlement remain active. This was reproduced locally.

**Fix:** introduce a reconciliation operation that synchronizes all supported provider states, including partial/full refunds, instead of treating reconciliation as capture-only activation. Add scheduled, paginated reconciliation with a durable cursor, retries and an exception list for unmatched records. Preserve an audit trail of changes. Razorpay retries failing deliveries for a limited window and can disable persistently failing webhooks; manual capture recovery alone is insufficient.

References: [server/billing.js:82](/Users/kalpa/Documents/Mediscribe/server/billing.js:82), [server/index.js:180](/Users/kalpa/Documents/Mediscribe/server/index.js:180), [Razorpay retry behavior](https://razorpay.com/docs/webhooks/best-practices/).

## 5. P1 — Required payment-history index is absent in production

The deployed Firestore payments composite-index listing is empty. The admin endpoint queries payments by `uid` and orders by descending `date`, requiring the index already defined locally. Once that query is executed, missing index configuration can fail the entire subscriber endpoint rather than show the ledger.

**Fix:** deploy [firestore.indexes.json](/Users/kalpa/Documents/Mediscribe/firestore.indexes.json:3), wait for the index to be ready, and test the actual administrator endpoint. Include database indexes in deployment verification. Do not infer admin readiness from `/health`.

Reference: [server/index.js:91](/Users/kalpa/Documents/Mediscribe/server/index.js:91), [Firebase index documentation](https://firebase.google.com/docs/firestore/query-data/index-overview).

## 6. P1 — The old subscriber-sync script can write incorrect licenses

The reporting script fetches only 100 provider payments, guesses yearly/monthly terms from amounts when notes are absent, collapses multiple payments by email, and then optionally writes activation flags directly into email/HWID-keyed user documents. New backend orders only add `notes.app`, so the plan-guessing fallback is relevant. A discounted annual INR 745 purchase is classified as monthly. An older failed payment can overwrite a newer captured payment for the same email; merging a pre-existing active Firestore profile can then make the resulting failed-payment record eligible for `--sync`.

**Fix:** disable or retire `--sync`; route verified historical imports through the UID-based audited migration endpoint. Use canonical order/payment IDs and stored plan metadata, retain every transaction, and paginate provider results. Reporting must not change entitlements. Replace the fixed foreign-currency multiplier with per-currency totals or explicitly sourced conversion data.

References: [scripts/list-subscribers.js:129](/Users/kalpa/Documents/Mediscribe/scripts/list-subscribers.js:129), [plan inference:143](/Users/kalpa/Documents/Mediscribe/scripts/list-subscribers.js:143), [email overwrite:174](/Users/kalpa/Documents/Mediscribe/scripts/list-subscribers.js:174), [unsafe sync:381](/Users/kalpa/Documents/Mediscribe/scripts/list-subscribers.js:381).

## 7. P2 — Payment dates use processing time, changing records and expiry

Normal fulfillment stores `new Date(now())` as the purchase date. A delayed webhook or recovery therefore changes the recorded purchase date and extends the subscription from processing time. A synthetic January 1 monthly payment first reconciled April 1 was recorded as April 1 with expiry May 1. Legacy migration uses provider time, so the two paths are inconsistent.

**Fix:** retain provider payment creation/capture timestamps and separate `receivedAt`/`processedAt`. Decide explicitly whether access starts at purchase or activation and store that separately; retries must not rewrite payment chronology.

Reference: [server/billing.js:92](/Users/kalpa/Documents/Mediscribe/server/billing.js:92).

## 8. P2 — The dashboard is a subscription summary, not a complete money ledger

A partial refund changes status to `refunded`, after which the entire payment is excluded from captured/revenue totals. A INR 149 payment with INR 1 refunded contributes zero rather than showing INR 149 gross, INR 1 refunded and INR 148 retained. The UI shows the original payment amount and generic refunded status without the actual refunded/net amount. It also prefixes every history amount with the rupee symbol, including USD/EUR/GBP. Payments are bounded to 100 per user; the existing truncation labels are useful, but this remains a limited history rather than a complete accounting export.

**Fix:** keep integer minor-unit amounts in storage, format by currency at display time, and show gross collected, partial/full refunds, net retained, fees/tax and settled amounts separately. Do not sum different currencies as though they were INR. Add a paginated transaction export with payment/order/refund IDs and timestamps; preserve subscription summaries as a separate view. Confirm the current business policy that even a partial refund removes the entire associated access grant.

References: [server/index.js:109](/Users/kalpa/Documents/Mediscribe/server/index.js:109), [revenue:123](/Users/kalpa/Documents/Mediscribe/server/index.js:123), [history formatting:1007](/Users/kalpa/Documents/Mediscribe/src/components/admin-subscribers-view.tsx:1007), [CSV fields](/Users/kalpa/Documents/Mediscribe/src/lib/subscriber-csv.ts:9).

## 9. P1 — Desktop paid operations lack main-process entitlement enforcement

The renderer paywall is not enforced at the paid native-operation boundary: transcription, formatting and expansion-start handlers do not validate the current signed entitlement. Keyword/template listeners intentionally survive component unmount, and saving an inactive entitlement does not stop them. Access changing to expired/refunded can therefore leave an already-running expansion listener active. This is also bypassable through exposed renderer IPC methods; enabling/disabling DevTools alone is not an adequate fix.

**Fix:** put a shared entitlement check in the Electron main process for paid operations, recheck expiry during long-lived listeners, and stop active paid operations on revocation, account change or logout. Retain the intended bounded offline-access policy.

References: [native cache update:3189](/Users/kalpa/Documents/Mediscribe/electron/main.js:3189), [template listener:3738](/Users/kalpa/Documents/Mediscribe/electron/main.js:3738), [keyword listener:3776](/Users/kalpa/Documents/Mediscribe/electron/main.js:3776), [formatting:4462](/Users/kalpa/Documents/Mediscribe/electron/main.js:4462), [transcription:4620](/Users/kalpa/Documents/Mediscribe/electron/main.js:4620).

## 10. P1 — Legacy device eviction can log out a legitimate upgraded device

`get-google-status` still triggers the old Drive device-registry check, but its registration/limit function is no longer called. A device absent from an existing registry is forcibly logged out even if its entitlement is valid. The isolated registry-function reproduction confirmed the logout/eviction path for a new device.

**Fix:** remove the obsolete check or implement registration and enforcement together through the authenticated backend, including a tested legacy migration. Do not use a stale user-editable Drive registry as entitlement authority.

References: [electron/main.js:511](/Users/kalpa/Documents/Mediscribe/electron/main.js:511), [caller:3125](/Users/kalpa/Documents/Mediscribe/electron/main.js:3125).

## 11. P1 — Desktop Google sign-in is not configured in the current output

The generated public configuration has an empty desktop Google client ID. The native OAuth flow explicitly throws in that case, while the configuration generator allows an empty value. Browser Google login succeeding does not validate native sign-in or Drive sync.

**Fix:** configure the intended installed-application OAuth client and make the release check fail when a shipped sign-in feature lacks its required configuration. Test Google sign-in and Drive sync in the packaged app.

References: [electron/oauth-handler.js:40](/Users/kalpa/Documents/Mediscribe/electron/oauth-handler.js:40), [scripts/configure-public-client.js:11](/Users/kalpa/Documents/Mediscribe/scripts/configure-public-client.js:11).

## 12. P2 — Access status is confused with paid status in the UI

The server uses `isActivated` for any currently active entitlement, including a trial. The client interprets it as paid activation and requires `!isActivated` to display the trial countdown. A legitimate trial therefore appears as Pro instead of showing its remaining trial time. Separately, an administrator without customer access is blocked by the paywall before reaching admin navigation, and manual payment recovery always announces activation without inspecting the returned entitlement.

**Fix:** use distinct `hasAccess`, `isPaid`, `isTrial` and administrator-permission states. Keep admin reporting accessible to authorized administrators independently of customer subscription access. Show the actual result after recovery, including an expired grant, rather than unconditional activation success.

References: [trial payload](/Users/kalpa/Documents/Mediscribe/server/billing.js:23), [client application](/Users/kalpa/Documents/Mediscribe/src/components/mediscribe-app.tsx:182), [paywall:300](/Users/kalpa/Documents/Mediscribe/src/components/mediscribe-app.tsx:300), [manual recovery:70](/Users/kalpa/Documents/Mediscribe/src/components/pricing-view.tsx:70).

## Recommended payment-record design and acceptance checks

Retain a durable order record, one canonical payment record per provider payment, individual refund records, and a deduplicated webhook inbox keyed by provider event ID. Record provider timestamps separately from receipt/processing timestamps. Keep UID/order ownership, currency and minor-unit amounts explicit; keep entitlements derived from protected records. Add reconciliation jobs and alerts for failures/unmatched payments, with safe retry and replay. Add settlement/fee records if the goal is tracking money actually received in the bank, not just successful customer payments.

The current server-authoritative prices, captured amount/currency checks, ownership checks, raw-body HMAC verification and capture idempotency are good foundations. Extend those guarantees across the entire payment lifecycle.

Before release, verify in an isolated provider test environment: successful capture and activation, failed/abandoned authorization, repeated and out-of-order events, concurrent capture/refund, partial and full refunds, missed-webhook reconciliation, renewals, historical migration, account switching, and a complete transaction export. Confirm merchant automatic-capture settings: the implementation requires captured payments and does not itself capture authorized ones. The existing monthly/yearly flow creates one-time orders; clarify that it does not implement automatic recurring debits.

Commit and review the intended source revision before building. Deploy rules/indexes with a tested migration plan, rotate exposed credentials, and test the exact installers on supported devices. Neither a passing unit suite nor a healthy backend endpoint substitutes for these checks.
