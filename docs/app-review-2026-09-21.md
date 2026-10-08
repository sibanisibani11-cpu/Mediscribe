# MediScribe extensive source review — September 21, 2026

## Assessment

**Further fixes are required before release.** The earlier security and data-safety repairs materially improve the app, but passing the current regression suite is not enough to establish correct payment, account-isolation, transcription or packaging behavior.

This review examined the current local frontend, Electron handlers, Google OAuth/Drive integration, billing backend, telemetry/admin data contract, model downloads, build scripts and release workflows. It did not change production application code. It added isolated audit reproductions and this report. No customer data, live payments, production settings or releases were modified.

## Highest-priority findings

### 1. P1 — Spelling correction can silently change unflagged clinical content

Evidence: `electron/main.js:4497` accepts the entire model response; `electron/main.js:5065` replaces the transcript; `src/components/dictation-view.tsx:275` automatically inserts it into the target app.

The instruction to correct only flagged words is a prompt, not an enforced constraint. A synthetic model response changed “Patient has no feever. Give 5 mg.” into “Patient has fever. Give 50 mg.” and the actual correction function accepted it. This reproduces missing validation, not the measured frequency of such model output. The original recognition result is not returned alongside the corrected text for recovery or comparison.

Fix: apply validated replacements only within flagged spans, preserve all other characters, reject changed numbers/negation outside those spans, and retain the original transcript. If unrestricted rewriting remains an option, show the changes for acceptance before insertion. Validate with a synthetic clinical audio/text corpus.

### 2. P1 — Account changes expose and can upload the previous account's local libraries

Evidence: `electron/main.js:3086–3094` initializes one dictionary, keyword library and template library under the installation's userData directory. `clear-auth-session` at line 3251 clears entitlement state only. `sync-cloud` at line 229 checks the current Google identity but syncs those shared files.

After A signs out and B signs in on the same OS profile, B receives the same local records. If B connects matching Google Drive and merges/pushes, A's local content can be uploaded to B's Drive. The identity check prevents using mismatched tokens; it does not establish ownership of local data.

Fix: UID-scoped libraries and attachment directories; stop listeners and clear in-memory records during account switches; deliberate, recoverable migration of existing shared files. Test A→B→A with separate synthetic records and separate Drive mocks.

### 3. P1 — Repeated refund processing revokes later valid purchases

Evidence: `server/billing.js:85–92` marks a payment refunded and clears the user's entitlement on every invocation, even when that payment was already refunded.

Reproduction: buy A → refund A → buy B → replay refund A. B remains a captured payment, but access becomes inactive. The current refund test covers replaying fulfillment, not replaying the refund itself.

Fix: make refund processing idempotent and recompute access from the surviving entitlement ledger. A repeated old event must not change a newer subscription.

### 4. P1 — Refunding one payment removes unrelated renewal access; reconciliation cannot repair it

Evidence: `server/billing.js:92` clears the entire license. `server/billing.js:71–73` returns immediately for a previously captured payment.

Reproduction: buy A → buy B → refund A. B remains captured but access is lost. Calling fulfillment/reconciliation on B reports success without restoring access. This also prevents the admin reconciliation button from implementing the comment's suggested recovery.

Fix: calculate remaining paid entitlement from valid payment periods and apply an explicit partial/full-refund policy. Provide a trusted reconciliation operation that actually rebuilds entitlement state without double-counting payments.

### 5. P1 — Existing paid customers have no implemented migration path

Evidence: `server/billing.js:34–41` overwrites legacy license details on first account refresh. `server/billing.js:63–64` requires an order already present in the new backend's orders collection before recovery.

Rejecting old client-writable flags is correct. However, a legitimately paid legacy account with an expired trial becomes inactive, and its historical payment cannot be recovered through the current path if the new backend has no corresponding order record. The test confirms loss of the legacy entitlement; live historical payment reconciliation was not exercised.

Fix: before rollout, import/reconcile trustworthy provider payment records against verified account ownership, preserve an audit trail, and define a support path for unmatched customers. Do not restore trust in client activation flags.

### 6. P1 — Local edits can report success after disk writes fail

Evidence: `electron/main.js:672`, `:700`, `:721` catch write failures without propagating them. `add-word` at line 3279 mutates memory, calls save and returns success regardless.

The actual save function swallows a simulated disk-full failure. Dictionary/template/keyword updates use direct overwrite rather than the atomic replacement added to cloud sync. A failed or interrupted write can lose edits or damage the file. Load failures then replace the in-memory collection with an empty array, allowing a subsequent save to overwrite the recoverable original.

Fix: atomic persistence with error propagation; commit memory only after a successful write; preserve/quarantine malformed files rather than treating them as empty successful loads. Cover disk-full, interrupted writes and corrupted startup files.

## Other confirmed defects and missing release safeguards

### 7. P2 — Trial users cannot purchase from the pricing page

Evidence: `server/billing.js:20` sets isActivated for an active trial. `src/components/pricing-view.tsx:357` disables purchases when isActivated is true and currentPlan is absent. Trial claims have no licenseDetails.billing, so both monthly/yearly buttons are disabled.

An audit test evaluates the real JSX condition using a real generated trial claim. Fix by separating paid-plan state from access state and explicitly allowing trial upgrades.

### 8. P2 — Microsoft Store sync and dashboard use incompatible schemas

Evidence: `scripts/sync-msstore-stats.js:62` writes analytics_sources/microsoft_store with a `total` field. `server/index.js:80` reads app_stats/microsoft_store and line 108 expects `acquisitions`.

Even a successful current sync cannot populate the current dashboard. Fix both the collection and field contract, migrate old snapshots where needed, and add a writer-to-reader integration test. Do not turn missing data into zero acquisitions.

### 9. P2 — Cloud validation accepts incomplete keyword/template records

Evidence: `electron/google-drive-sync.js:87–96` requires only a nonempty string ID for either record type. `{id:'broken'}` passes both validators.

Such data can replace a good local library even though consumers expect fields such as name, keyword, description, type and attachment/content. Subsequent rendering, sorting or expansion can fail. Fix with full per-type schemas, bounds, duplicate-ID handling and validation before attachment materialization or local replacement.

### 10. P2 — Merge sync resurrects deletions and can overwrite newer edits

Evidence: `electron/google-drive-sync.js:233–239` unions records by ID with unconditional local precedence; dictionary merge unions strings. There are no tombstones or revision comparisons.

Delete a previously synced record locally, then merge: the remote copy is restored. A stale device can also push its old value over a newer remote value. Fix with deletion markers, record revision metadata and conflict handling; test two-device edit/delete orderings. Explicit push can replace remote data, but does not make normal merge correct.

### 11. P2 — Partial multi-file sync leaves disk and live memory inconsistent

Evidence: `electron/main.js:237–245` syncs keywords, dictionary and templates sequentially, then reloads all libraries only after all three succeed.

If the first file changes and a later operation fails, the successful disk change remains while its in-memory counterpart stays old. A subsequent edit can overwrite that newly synced disk data. Fix by reloading each successfully committed file or by staging a coordinated multi-file update with explicit partial-success reporting.

### 12. P2 — Windows direct typing corrupts literal opening braces

Evidence: `electron/main.js:2213–2214` escapes `{` and then globally escapes `}` in the generated result. The second pass modifies the escape introduced by the first.

The real expression does not map a literal opening brace to the required `{{}` sequence. Fix with one-pass character mapping and verify literal braces, brackets, plus signs, percent signs, newlines and Unicode in a Windows typing target. Native SendKeys execution was not available in this review.

### 13. P2 — Admin CSV mislabels foreign-currency values and does not escape values correctly

Evidence: `src/components/admin-subscribers-view.tsx:152–173` labels amounts INR while the backend returns each subscriber's selected currency. Fields are wrapped in quotes without escaping embedded quotes.

A USD payment is exported as an INR-labeled number; names containing quotes/newlines can corrupt the CSV structure. Spreadsheet formula-like fields also lack neutralization. Fix: currency column and accurate amount headings, standards-compliant CSV escaping and safe handling of spreadsheet formulas. Multi-currency totals should stay separated or use a documented conversion policy.

### 14. P2 — Packaged-app security checks exist but are not release gates

Evidence: scripts/check-packaged-app.js is not invoked by any current workflow. Source checks cannot establish what ended up inside an installer. Release workflows can publish when RELEASE_APPROVED is true without running that artifact check or an installed-app smoke test.

Fix: run artifact checks against each unpacked application before publishing; require successful launch, model loading and native IPC smoke checks for each supported target.

### 15. P1 release gate — Native dependency bundling tolerates failures and lacks architecture validation

Evidence: `scripts/bundle-ffmpeg.js:11–13` selects x64 binaries even though package targets include arm64. Lines 55–64 download directly to the final file, accept curl's default HTTP behavior, and catch failures without exiting unsuccessfully. Other bundlers similarly log and continue when assets are missing.

A green build can therefore contain missing, erroneous or architecture-incompatible native executables. This is a confirmed build-validation gap; no new installer was generated to claim a specific artifact fails. Fix: platform/architecture-specific assets, hashes, atomic downloads, failure exit codes, and execution checks inside packaged artifacts. Do not assume compatibility translation is present on every supported machine.

### 16. P2 release gate — Android release signing and version progression are incomplete

Evidence: android/app/build.gradle declares versionCode 1/versionName 1.0 and no release signing configuration; the Android workflow builds and uploads release AAB/APK files without configuring signing.

The workflow can produce release artifacts without proving they are signed for distribution or have a versionCode higher than the deployed version. Fix an explicit signing and versioning pipeline, with keystore credentials kept out of the client/repository, and verify the artifact on an Android device. The currently published Store version was not queried.

## Deployment and operational blockers

- The local release configuration is still missing NEXT_PUBLIC_BACKEND_URL. The preceding continuation's configure:public check failed at that gate. No successful backend deployment is recorded. A release must use the real deployed URL and matching public signing key, never test placeholders.
- Configure and verify Firestore rules, backend secrets, administrator claims, webhook subscriptions and allowed origins together. The backend defaults allowed origins to empty, so a browser-hosted app is rejected until configured. Desktop file origins are treated separately.
- The server rate limiter keys on socket.remoteAddress, shares the limit across telemetry, checkout and webhook routes, and stores counters only in one process. Behind a shared ingress this can pool unrelated users; scaled instances also do not share limits. Verify actual Firebase ingress behavior and use an appropriate trusted identity/edge limiter. This is a deployment risk, not a reproduced production outage.
- Anonymous telemetry accepts client-chosen installation/session IDs. Idempotency stops duplicate IDs, not arbitrary fabricated installs. Treat counts as observed client events, not verified people/downloads. Current backend sets all such events to guest; the displayed logged-in count therefore does not measure logged-in launches.
- adminData reads entire users/payments/downloads/launches collections and filters the payments array once per user. This has unbounded read cost and response size. Use pagination and aggregation before relying on it at larger scale.
- Production credentials shipped by old releases must still be rotated/revoked where applicable. Removing them from new code does not invalidate old distributed copies. No credential value was printed or rotated in this review.

## What remains improved and verified locally

The existing 60-test suite passes along with TypeScript, lint and client security checks. Current tests cover signed installation/account-bound entitlements, ownership/amount/currency/capture checks, basic fulfillment idempotency, rejection of client-only privilege claims, password-reset failure reporting, Firebase raw-body handling, safer cloud file replacement, attachment transfer and incomplete model-download preservation. Transcript cleanup preserves signs, decimals and parenthesized content. These are useful repairs; the new findings concern other paths or combinations.

The new audit file has 11 passing evidence tests. **Those passes demonstrate defects or missing safeguards; they are not repair tests or release approval.** Some use extracted real functions/expressions with synthetic dependencies; others explicitly compare source contracts. They do not launch Electron or simulate every provider/platform behavior.

Commands:

```sh
npm run verify
node --test docs/audit/review-reproductions-2026-09-21.test.js
```

## Limits of this review

No native UI, microphone, real typing target, Google provider, live Firebase rules, real payments/refunds, Store report or fresh installer was exercised. No full release build was attempted through the known missing public configuration gate. Git and Apple tooling remain constrained by the unaccepted Xcode license recorded in the prior continuation.

A fresh npm audit attempt failed because registry.npmjs.org could not resolve in this environment. The prior zero-vulnerability result is therefore **not a current dependency-security verification**. A new registry audit is required before release.

## Recommended repair sequence

1. Protect original clinical text and isolate account-owned local data.
2. Correct refund/reconciliation semantics and prepare verified legacy-customer migration.
3. Make local persistence transactional and fix trial checkout.
4. Repair Store schema integration, sync semantics and CSV exports.
5. Wire artifact gates, architecture checks, Android signing/versioning and deployment configuration.
6. Run staged provider tests, two-account/two-device sync tests and installed-app checks before publishing.
