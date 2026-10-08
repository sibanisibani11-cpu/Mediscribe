# Repair continuation — September 21, 2026

Recovered the interrupted September 20 changes and ran the local verification suite. The original audit and first-batch notes describe older states; their unfixed-test counts no longer describe this workspace.

## Changes in this continuation

- Backend requests use Firebase's preserved rawBody buffer when the platform has already consumed the request stream. This preserves exact webhook signature bytes and JSON request bodies, with the same 64 KiB application limit as standalone Node requests.
- Added regression coverage for Firebase-style webhook requests, JSON ingestion and oversized raw bodies. Tests use synthetic data and mocked services.
- Removed the legacy Windows AppX workflow step that wrote merchant and OAuth secrets into .env. Public configuration already comes from the build step's explicit environment variables.

## Verification and release limitations

The initial verification passed typecheck, lint, 57 tests and the client security checks. Three new backend regressions also pass. No production payments or customer records were modified.

The public configuration gate currently fails because NEXT_PUBLIC_BACKEND_URL is absent. A deployed backend URL and matching Ed25519 public key must be configured before building a distributable. Do not bypass this gate with a placeholder production URL. Firebase deployment, merchant webhooks, secret configuration, administrator claims and real provider login still need verification. Existing paid accounts need reconciliation against trusted payment records before rollout; legacy client-written activation flags must not be trusted.

The previous task prepared server/functions.js and firebase.json for the existing Firebase project, but no successful deployment is recorded. Desktop and web retain the app's payment/admin UI; privileged operations require that server component.

Git and Apple command-line tooling are blocked by the machine's unaccepted Xcode license. No installer, signing, Store submission, installed-app smoke test or live payment test was completed. No release was published.

Final verification after these changes: npm run verify passed, including TypeScript, lint, all 60 tests and client security checks.

# Repair continuation — September 23, 2026

The September 21 passing result above predates the interrupted review repairs. At the start of this continuation, the current workspace had 18 failing tests and several modules were only partially connected.

Completed the remaining local integrations: account-scoped Electron libraries with atomic writes and failure rollback, deliberate legacy import, revision-aware sync with account-switch guards and per-library reloads, bounded admin pagination/history, awaited UID rate limits, legacy billing migration routing, Store writer/reader contract, architecture-specific runtime paths and packaging gates, and Android signing/version inputs. Added transcription, account isolation, corruption, conflict/deletion, refund/reconciliation, migration, pagination, rate-limit, CSV and native-download regressions. Transcript correction is limited to validated spelling choices and requires review before inserting changes. Recorder teardown now cancels listeners/streams on unmount.

Local validation: `npm run verify` passes 76 tests, TypeScript and client security checks. ESLint has warnings but no errors. Workflow YAML parses successfully. No installer, live provider test, deployment, customer migration or release was performed. The public configuration gate still fails because `NEXT_PUBLIC_BACKEND_URL` is missing; reviewed native hashes, signing inputs and platform smoke tests are also needed. See `docs/release-configuration.md` for the concrete inputs and checks.

The original review reproductions under `docs/audit` are historical evidence tests, not the current repair suite. Run `npm run verify` for repair regressions. Git inspection works with the bundled Git executable; the system Xcode toolchain still requires its license to be accepted by the user before native compilation.
