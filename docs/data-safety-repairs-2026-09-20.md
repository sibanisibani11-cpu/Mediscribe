# First repair batch — 2026-09-20

Implemented locally following the September 19 audit:

- Transcription cleanup now trims only outer whitespace. It preserves decimals, signs, Unicode, brackets, parentheses, and line breaks. Text-only hallucination suppression has been removed because it could discard genuine dictated content. Recognition and optional LLM correction still require separate accuracy testing.
- Removed identified raw transcript, correction, spelling-token, typing-preview, expansion-text, and Whisper response/process-output logging. Diagnostic counts and lifecycle messages remain. Existing historical logs have not been deleted; this is not a comprehensive audit of every exception/log path.
- Drive download/pull validates complete JSON before writing a private temporary file beside the destination and committing by rename. Failed reads, invalid data, and failed writes preserve the destination. Temporary files are cleaned up.
- Failed remote lookups now throw instead of being mistaken for missing cloud files. Corrupt local merge inputs abort. Push/merge upload failures propagate to the existing sync error handler.
- Templates and keywords merge by stable ID, with local values winning conflicts. Dictionary entries are deduplicated. A failed upload after merge leaves the merged local copy available for retry.

Validation: 23 data-safety regression tests plus eight existing payment/Store tests pass. Six remaining audit reproductions still demonstrate unfixed defects. TypeScript and JavaScript syntax checks pass. Tests use synthetic temporary files and mocked Drive calls, with no production account access.

Limitations: no native installer or live two-device Drive test was performed. Multi-file sync is not a single transaction; earlier successful files can remain synced if a later file fails. Concurrent devices can still overwrite newer cloud changes without revision-based conflict control. Credentials, backend payment verification, authentication, model handling, tracking, and release work remain as listed in the original audit. Source changes do not update installed copies.

Run checks:

```sh
node --test scripts/data-safety.test.js scripts/audit-reproductions.test.js scripts/payment-activation.test.js scripts/sync-msstore-stats.test.js
npm run typecheck
node --check electron/main.js
node --check electron/google-drive-sync.js
```
