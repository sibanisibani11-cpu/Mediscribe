# Release preparation status — October 9, 2026

Target scope: Windows x64, macOS Intel and Apple Silicon, Linux x64, and Android. No installer or store release has been published. Source is on `codex/release-readiness` in `sibanisibani11-cpu/Mediscribe`; main is unchanged.

## Production payment key rotation completed

The replacement provided in the local Razorpay CSV authenticated successfully. The previous pair returned HTTP 401. The local `.env` was updated from the validated CSV; both files have owner-only permissions, and the CSV is ignored by Git. No credential values were printed or committed.

After explicit authorization, replacement versions of `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` were uploaded to Secret Manager in `studio-1170771809-75956`. Both functions were redeployed and read back as `ACTIVE`, bound to the new versions:

- API: `mediscribeapi-00007-yej`, updated October 8 at 23:50:31 IST.
- Scheduled recovery: `reconcilepayments-00002-nug`, updated October 8 at 23:50:22 IST.

All seven live probes passed: health 200; unauthenticated export, migration and reconciliation 401; invalid webhook signature 401; localhost preflight 204; untrusted origin 403. These do not constitute a purchase/refund end-to-end test.

Cloud Scheduler is enabled every 15 minutes. Its first post-rotation run completed October 8 at 23:57:14 IST, checked three records, reported zero failures, and cleared all prior open recovery issues. The prior failed run occurred before the new key was deployed. The job performs provider reads and local ledger recovery; it does not charge or refund customers.

Firebase confirmed successful deployment but exited 1 afterward because Artifact Registry has no cleanup policy. No cleanup/deletion policy was introduced.

## Source and native validation

- Local `npm run verify`: TypeScript, lint, 111 tests and client security checks passed.
- Local static Next.js build passed.
- Initial GitHub source checks and production dependency audits passed.
- Initial Apple Silicon CI native test passed actual WAV/WebM/M4A conversion, Whisper base.en inference, and isolated Ollama startup.
- The follow-up CI run passed source checks, production dependency audits, Android debug APK compilation and lint, and native smoke tests on Linux and Apple Silicon. The debug APK is downloaded locally to `dist-electron/android-debug/app-debug.apk` (not a signed release candidate).
- Windows progressed to FFmpeg configuration but failed because the bundler assumed `C:\\msys64` instead of the path provided by the MSYS2 action. All Windows build workflows now pass the action's actual installation path. The standalone FFmpeg build also disables unused iconv and statically links MinGW runtime dependencies.
- Intel diagnostics identified Whisper loading incompatible Ollama GGML libraries from the shared executable directory. Ollama now has an isolated `ollama-runtime` directory. Application paths, package checks, and native smoke tests use that layout; rebundling removes the old manifest-listed Ollama files while preserving other assets. The next CI run must pass before claiming Windows/Intel readiness.
- Native asset downloads remain hash-checked after retries. The library-copy regression has tests for dereferencing, archive confinement, cycles and executable permissions.
- Icon build dependencies are now explicit and locked; icon generation no longer installs arbitrary versions during the build.

Validation runs: [initial run](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37823597705), [follow-up run](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37824672242).

## Inputs and checks still required

1. **Desktop Google sign-in:** Google Cloud currently lists only a Web application OAuth client. Create a Desktop app client in the same project and configure `GOOGLE_DESKTOP_CLIENT_FILE` locally or `GOOGLE_DESKTOP_CLIENT_ID` / `GOOGLE_DESKTOP_CLIENT_SECRET` in build variables. A web client must not be packaged as a desktop client. The native package gate currently blocks this missing configuration.
2. **macOS signing:** Developer ID certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`) and notarization (`APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`).
3. **Windows signing:** configured `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, and a publisher name matching that certificate for direct installers. Store package identity must match Partner Center.
4. **Android release:** existing upload keystore, its passwords/alias, verified previous Play version code and a strictly higher new version code. A debug build cannot substitute for the signed release artifact.
5. **Provider integration:** test-mode purchase, duplicate capture delivery, missed-webhook recovery, partial/full refund and ledger/export checks. Webhook registration/capture settings have not been verified through the merchant dashboard; only rejection of invalid signatures is verified.
6. **Legacy purchase:** independently verify ownership of the known historical payment before invoking the documented migration endpoint. No reassignment/import was made during this continuation.
7. **Installed app acceptance:** microphone permission/capture, transcription, LLM generation, native insertion, Google/email sign-in and sign-out, two-account library isolation, two-device sync/conflicts, checkout/refund and admin access on the exact release artifacts. Android's current recording path relies on Web Speech API availability; verify this on the intended Android WebView/device before release.

Do not set `RELEASE_APPROVED` or `NATIVE_SMOKE_TESTED_SHA` until the required acceptance checks pass. Neither a debug APK nor native command-line tests attest an installed release.
