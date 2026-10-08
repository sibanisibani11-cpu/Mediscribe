# Release configuration and remaining operational checks

The September 23 continuation completes the interrupted source integrations. It does not deploy the backend, migrate real payments, rotate credentials, or approve a release.

## Backend

Configure the Firebase function secrets, real allowed origins, and administrator claims, then deploy functions, Firestore rules and `firestore.indexes.json` together. The payments UID/date index supports bounded subscriber histories; the TTL policy removes expired rate-limit documents. Authenticated limits use shared Firestore transactions keyed by UID. Anonymous telemetry and signed webhook ingress still require platform/edge protection; client event IDs are not verified people or downloads.

Set `NEXT_PUBLIC_BACKEND_URL` to the deployed HTTPS backend and `ENTITLEMENT_PUBLIC_KEY` to its matching Ed25519 public key. Configure the public Firebase values and the desktop Google OAuth client. `npm run configure:public` fails while the backend URL is missing. Never use a placeholder URL or a throwaway signing key for a distributable.

Before rollout, reconcile paid legacy accounts from provider records. The administrator-only `POST /v1/admin/migrate-legacy` endpoint takes `uid`, `paymentId`, `plan` (`monthly` or `yearly`), `reason`, and `evidenceReference`. Support must verify account ownership and the purchased term against trustworthy records first. The endpoint verifies the captured, unrefunded provider payment/order, preserves the original purchase date and records an audit entry; it does not trust legacy activation flags. Unmatched customers need manual support. Repeated imports cannot reassign payments or extend the original term. Partial refunds revoke only that payment's entire grant; unrelated captured grants remain in the ledger. Confirm this policy with the business before rollout.

Run Microsoft Store acquisition sync again to populate the unified `app_stats/microsoft_store.acquisitions` snapshot. Older snapshots are preserved but not automatically treated as current data. Rotate/revoke previously distributed private credentials through their respective providers.

## Native assets and packaging

`NATIVE_ASSET_MANIFEST` points to a JSON object keyed by `asset/target`; each entry contains a reviewed HTTPS `url` and 64-character `sha256`. CI writes it from the repository variable `NATIVE_ASSET_PINS`. No hashes were invented or fetched from unverified local files.

Required keys are `ffmpeg/<target>`, `ollama/<target>`, `whisper/win32-x64` for Windows, `whisper_source/all` for macOS/Linux source builds, `vcredist/win32-x64` for Windows, and `ggml-base.en/all`, `ggml-tiny/all` for models. Supported targets are `win32-x64`, `darwin-x64`, `darwin-arm64`, and `linux-x64`. Windows ARM64 publishing is disabled until a complete compatible asset set is implemented and tested. Set `TARGET_PLATFORM` and `TARGET_ARCH` for the target being built. Whisper source compilation requires CMake and a working C/C++ toolchain. Cross-platform local builds require bundling each target independently before packaging it.

The `afterPack` hook checks the actual app archive for forbidden files/configuration, then validates native hashes, executable architectures, runtime-library hashes and model hashes. It runs native executable help/version commands when the host matches the target. These commands do not establish working microphone capture, model inference, keyboard IPC, installer behavior, or provider integration.

Publishing requires `RELEASE_APPROVED=true` and `NATIVE_SMOKE_TESTED_SHA` equal to the exact Git commit. Set that attestation only after testing every intended artifact on its supported OS/architecture: install and launch, microphone permission, model loading/inference, preserved transcript/review, native insertion, sign-in/out, two-account libraries, two-device sync/conflicts, checkout/refund, and admin queries. A hash attestation is a manual release control, not an automated installed-app test.

## Android

Provide `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as CI secrets. Set repository variables `ANDROID_VERSION_NAME`, `ANDROID_VERSION_CODE`, and `ANDROID_PREVIOUS_VERSION_CODE` from the verified published version. Gradle rejects release builds without signing inputs or a strictly increasing code; CI verifies the APK/AAB signatures and removes the temporary keystore. Verify the upload certificate matches Play Console and test the installed app on a device. No Android build was run locally.

## Local data recovery

Libraries now live under hashed account directories. Sign-out clears active records and stops expansion listeners. The dictionary manager's “Import libraries from the older app” button explicitly claims legacy dictionary, keyword and template files for the signed-in account; originals remain untouched. Only use it when those records belong to that account. Malformed libraries block writes and remain available for recovery. Concurrent divergent sync edits require explicit Upload/Download after reviewing both devices; known deletions carry revision tombstones.
