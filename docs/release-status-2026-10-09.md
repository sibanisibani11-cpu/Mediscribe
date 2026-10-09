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

**All six CI jobs passed at source revision `7d20c1c7c3aa57891d638d6dd9883f5365eb7148`.** [Successful validation run](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37911184868).

| Check | Verified result |
| --- | --- |
| Source | TypeScript, ESLint (warnings remain), 115 tests and client security checks passed |
| Dependencies | App/backend production dependency audits passed |
| Windows x64 | Native build, WAV/WebM/M4A conversion, real Whisper base.en transcription and isolated Ollama startup passed |
| macOS Intel | Native build, WAV/WebM/M4A conversion, real Whisper base.en transcription and isolated Ollama startup passed |
| macOS Apple Silicon | Native build, WAV/WebM/M4A conversion, real Whisper base.en transcription and isolated Ollama startup passed |
| Linux x64 | Native build, WAV/WebM/M4A conversion, real Whisper base.en transcription and isolated Ollama startup passed |
| Android | Web asset build, Capacitor sync, debug APK compilation and Android lint passed |
| Local web build | Static Next.js build passed |
| Local LLM inference | Bundled Apple Silicon Ollama generated text with the existing `llama3.2:3b` model and a synthetic prompt |

The latest debug APK is at `dist-electron/android-debug-7d20c1c/app-debug.apk`. Its ZIP integrity check passed. SHA-256: `016827ca0791cf0473e0313ce56a7c9d8af15a8ec21ddb35ecac3daf4c319372`. It is a debug test artifact, not the signed release APK/AAB. Earlier debug APKs remain in their separate artifact directories.

The local Android entry points now explicitly skip desktop native downloads and desktop OAuth requirements, matching Android CI. `npm run cap:sync` builds and syncs Android web assets; `npm run build:android` first checks Android release signing/version inputs and then builds with the host's Gradle wrapper. Keystore paths are resolved before changing working directories. Four additional regression tests cover platform routing, fail-fast behavior, signing inputs and version codes; all 115 local tests, type checks, lint and client security checks passed. The Android CI job built the debug APK and passed lint using the corrected entry point. `npm run release:check -- --android` currently reports the missing upload keystore, passwords/alias, version name and verified increasing version code.

The CI failures led to these repairs:

- Android explicitly installs `platform-tools`, avoiding the removed SDK `tools` package.
- Ollama runtime copying materializes library links and rejects archive escapes/cycles, avoiding Node 22's recursive-copy regression. Native downloads retry interrupted connections and still require the pinned SHA-256.
- Windows workflows use the MSYS2 action's actual installation path. FFmpeg disables unused iconv and statically links MinGW runtime dependencies.
- Ollama's executable and libraries live under `ollama-runtime`. This stops Whisper from loading Ollama's incompatible GGML libraries, the cause of the Intel crash. Application paths, package checks and smoke tests use the isolated layout. Rebundling removes old manifest-listed Ollama files while preserving other assets.
- Icon generation uses explicitly locked dependencies; it no longer installs arbitrary package versions during builds.

The local LLM test used no customer content and downloaded no model. The native tests use synthetic tones and the checksum-pinned upstream speech fixture. Native tests do not verify signed installer behavior, live microphone use, or LLM generation on Windows/Linux/Intel Mac.

Earlier diagnostic runs: [initial](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37823597705), [follow-up](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37824672242).

## Inputs and checks still required

1. **Desktop Google sign-in:** On October 9, the newly downloaded Desktop app JSON was validated for the expected project and configured locally through `GOOGLE_DESKTOP_CLIENT_FILE`. The downloaded JSON is ignored by Git and restricted to owner access; no credential values are recorded here. Desktop OAuth configuration checks now pass for macOS, Windows and Linux. GitHub `GOOGLE_DESKTOP_CLIENT_ID` / `GOOGLE_DESKTOP_CLIENT_SECRET` still need configuration from this installed-app client before remote packaging; the Windows AppX workflow accepts repository secrets, with variables as a fallback. A successful preflight does not verify interactive Google sign-in or Drive sync; those acceptance checks remain pending.
2. **macOS signing:** Deferred: the owner confirmed no Apple Developer membership. Public distribution still needs a Developer ID certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`) and notarization (`APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`).
3. **Windows Store:** The owner's October 9 Partner Center screenshots confirm Store ID `9PNJJSPMX9TR`, identity `mediapp.MediScribe`, the configured publisher, and current version `1.2.0.0` for x64 and ARM64. The candidate is `1.2.1.0` x64; ARM64 remains unsupported by the new native runtime bundle and has no new candidate. `docs/microsoft-store-release.json` records the verified identity/version baseline. The AppX workflow now checks the built manifest against that record and manual builds cannot publish. These latest packaging changes have passed local YAML/configuration checks but await an actual AppX build. Store AppX submission does not require purchasing a signing certificate; direct Windows installers still need `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, and a matching publisher name.
4. **Android release:** existing upload keystore, its passwords/alias, verified previous Play version code and a strictly higher new version code. A debug build cannot substitute for the signed release artifact.
5. **Provider integration:** test-mode purchase, duplicate capture delivery, missed-webhook recovery, partial/full refund and ledger/export checks. Webhook registration/capture settings have not been verified through the merchant dashboard; only rejection of invalid signatures is verified.
6. **Legacy purchase:** independently verify ownership of the known historical payment before invoking the documented migration endpoint. No reassignment/import was made during this continuation.
7. **Installed app acceptance:** microphone permission/capture, transcription, LLM generation, native insertion, Google/email sign-in and sign-out, two-account library isolation, two-device sync/conflicts, checkout/refund and admin access on the exact release artifacts. Android's current recording path relies on Web Speech API availability; verify this on the intended Android WebView/device before release.

Do not set `RELEASE_APPROVED` or `NATIVE_SMOKE_TESTED_SHA` until the required acceptance checks pass. Neither a debug APK nor native command-line tests attest an installed release.
