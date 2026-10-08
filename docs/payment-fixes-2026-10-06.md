# Payment repair status — October 6, 2026

The payment backend, restrictive Firestore rules, and payment indexes have now been deployed to `studio-1170771809-75956`. Client UI/native changes remain local and have not been packaged or published. The working tree has not been committed. The earlier audit describes the pre-repair state.

## Implemented

- Entitlements are rebuilt from the protected payment ledger and Firebase Auth account creation time. Client-written activation, trial and version flags cannot grant access.
- Fulfillment uses the provider purchase timestamp, verifies ownership and order amount/currency, and preserves cumulative refund state. A refund arriving before capture leaves a durable marker. Replayed or stale capture data cannot restore refunded access.
- Reconciliation recognizes refunded payments. Any refund revokes that payment's access grant; other valid grants remain. This preserves the existing refund/access policy, including partial refunds.
- Verified capture/refund webhook requests record receipt and processing status. Failures remain retryable. Provider refund lag returns an error for retry rather than falsely marking the event processed. Completed duplicate payloads are acknowledged without applying them again.
- Admin history records original amount, refunded amount, net receipts and currency. Page totals subtract partial refunds. Totals remain explicitly limited to shown history and exclude provider fees, settlement adjustments, disputes and taxes.
- An administrator-only paginated payment export retains each transaction. The reporting script reads this endpoint, uses no merchant credential, and cannot write licenses. The old `--sync` behavior is rejected.
- Trial access is displayed separately from paid access. Manual recovery announces activation only when the returned entitlement contains an active paid license. Verified admins can reach the admin view without a customer subscription.
- Native transcription, formatting, typing and expansion starts require verified access. Typing checks again before injection; active expansion listeners stop when access expires or a revoked entitlement arrives. The obsolete Drive device-registry eviction call is removed.
- Desktop packaging rejects a missing Google OAuth client ID instead of releasing a known broken sign-in configuration.

## Validation

`npm run verify`: TypeScript, ESLint, 89 tests, and client security checks pass. `node --check electron/main.js` passes. Regression coverage includes forged profile claims, refund-before-capture, stale captures, partial-refund reconciliation and accounting, webhook retry/deduplication, paginated transaction exports, CSV formula escaping, and native access gates. These tests use synthetic data; no real payment or refund was initiated.

## Remaining release and production work

1. Rotate the merchant secret identified in the audit. Removing its current source occurrence does not revoke copies in Git history or previously distributed clients. Provision the replacement only on the backend.
2. Backend, rules and index deployment is complete. Older clients can no longer write billing profiles directly. Release the updated client and complete the legacy migration described below.
3. Supply the actual desktop Google OAuth client configuration and build/test native installers. The current public configuration has no Google client ID, so the new package gate intentionally blocks release.
4. Run an end-to-end provider test-mode purchase, duplicate webhook, missed-webhook recovery and refund through the deployed app. Verify merchant capture settings and compare exported ledger records against Razorpay. Live checkout availability alone is insufficient validation.
5. Establish scheduled reconciliation and operational alerts for failed/pending webhook receipts. The admin reconcile endpoint exists, but no automatic reconciliation schedule is installed. Add settlement/fee/dispute accounting if full accounting reconciliation is required.

Export after backend deployment: provide `NEXT_PUBLIC_BACKEND_URL` and a short-lived `FIREBASE_ADMIN_ID_TOKEN` securely in the local process environment, then run `npm run subscribers -- --csv`. The file is `payments_report.csv`; amounts are integer currency minor units. Do not paste credentials into chat or commit exports containing customer data.

## Production continuation

Firebase reported a successful `mediscribeApi` update and successful rules/index deployments. The function CLI then exited 1 solely because Artifact Registry has no cleanup policy; no automatic deletion policy was added. Rules compiled successfully before release.

A read-only production scan found seven user documents, zero canonical payment records, and one activated legacy profile. Its referenced Razorpay payment is captured and unrefunded, with a yearly provider note and purchase date April 27, 2026, but no provider order ID. No customer identity, payment ID or credential was printed. The strict legacy migration endpoint currently requires a verifiable provider order, so this purchase needs a reviewed migration path for orderless historical payments and verified assignment to the correct Firebase account. No grant or customer record was changed during this check. Do not treat the empty new ledger as evidence that no historical money was received.

The legacy payment was verified using the existing locally configured merchant credential, which still authenticates. Its prior exposure therefore remains actionable: key rotation is still required. This deployment does not rotate it.

Live probes passed: health 200; unauthenticated admin export and reconciliation 401; invalid webhook signature 401; localhost preview preflight 204; untrusted origin 403. Read-back confirms the restrictive rules are active. The payment index subsequently reached `READY`, verified by the Firestore API. No real purchase/refund or authenticated export was performed.

## October 8 continuation

Added administrator-only migration support for captured, unrefunded historical payments with no Razorpay order ID. Orderless imports require matching explicit provider plan metadata and the existing ownership-verification reason/evidence fields. They preserve a null order ID, original purchase date, and administrator audit record. Reconciliation now handles missed partial/full refunds for those imports and rejects customer claims from another account. No production customer payment has been imported or reassigned by this continuation.

`npm run verify` passes TypeScript, lint, all 102 tests, and client security checks. The 13 added regressions cover orderless imports, missing/conflicting provider metadata, invalid payment state, ownership, repeated imports, refund recovery, missing audit/ledger records, and assignment changes during reconciliation. Live read-back on October 8 confirmed restrictive Firestore rules and a `READY` payment-history index.

See [the migration procedure](legacy-payment-migration.md) for required ownership evidence and request fields. This supersedes the earlier technical limitation requiring every historical payment to have an order. The known legacy purchase still awaits verified assignment; a client-written profile reference alone is insufficient. Merchant-key rotation, desktop OAuth configuration, installer validation, provider test-mode end-to-end checks, and scheduled reconciliation remain outstanding.

Deployment completed on October 8. Cloud Functions read-back confirms `ACTIVE` revision `mediscribeapi-00005-vus`, updated at `2026-10-08T09:56:46Z` (3:26 PM IST). All seven live probes passed: health 200; unauthenticated export, migration, and reconciliation 401; invalid webhook signature 401; localhost preflight 204; untrusted origin 403. The CLI again exited 1 only after confirming successful deployment because no Artifact Registry cleanup policy is configured; no deletion policy was added. These probes do not verify an authenticated production import, real purchase, or refund. Changes remain uncommitted; no desktop release was published.
