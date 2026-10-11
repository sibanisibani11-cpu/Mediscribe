# Windows candidate continuation — October 10, 2026

The October 9 release status remains the baseline for other platforms and outstanding acceptance checks. No Store submission or public release has been made.

## Repairs and verification

The authorized Google Desktop OAuth client ID and secret were saved in repository Actions secrets on October 9. The build logs confirm both inputs are supplied; interactive sign-in remains untested.

The first Windows candidate run, [37935547152](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37935547152), failed because Git Bash's tar interpreted the `D:` archive path as a remote host. Commit `cb4e127` selects the Windows system `tar.exe` explicitly. The next run completed native compilation, confirming the extraction fix.

That follow-up run, [37977527546](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37977527546), exposed a Windows library-write failure: `fsync` rejected a read-only file handle. Commit `cdb83bb` opens the temporary file with write access before flushing and replacing the original. Regression checks cover successful replacement and preservation/cleanup on flush failure. Two existing test assumptions were corrected: a synthetic Unix path now consistently uses POSIX path operations, and the executable permission-bit assertion only applies to Unix platforms. Windows still checks runtime link materialization and file contents.

Local TypeScript, ESLint (existing warnings), all 119 tests and client security checks passed. Run [37978464360](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37978464360), source `cdb83bb`, passed the Windows tests, web build and native bundling. Packaging then rejected the obsolete top-level `win.publisherName` setting. Commit `63e6090` moved it under `win.signtoolOptions` and added a full configuration-schema regression test; that test passed locally. Run [37979122199](https://github.com/sibanisibani11-cpu/Mediscribe/actions/runs/37979122199), source `63e6090`, completed successfully. All 120 Windows tests, TypeScript, lint, client security checks, web build, native bundling, packaged-content/native checks and Store identity/version verification passed. The AppX artifact was uploaded; the Store publishing step was skipped.

## Candidate artifact

- Version: `1.2.1.0`, Windows x64.
- Build/source: run `37979122199`, commit `63e6090`.
- AppX SHA-256 from the Windows validation: `51bfa85828c9a5b8a0c5d0b84c2bed114f5126b83050a681fe6c7647e2c1fb89`.
- GitHub artifact: `MediScribe-AppX-x64` (workflow retention: seven days).
- Download verified locally on October 11: `dist-electron/windows-store-63e6090/MediScribe 1.2.1.appx` (1,897,769,916 bytes). The artifact ZIP SHA-256 matched the Actions upload digest; the extracted AppX matched the Windows checksum, passed ZIP CRC integrity checks, and its manifest matched the recorded Store name, publisher, version and architecture. `SHA256SUMS.txt` is saved beside the package.

## Remaining acceptance

The candidate targets version `1.2.1.0`, x64, with the verified existing Store identity. Windows ARM64 has no new candidate. Manual workflow dispatch cannot publish to the Store.

Before release approval, test the exact installed Windows candidate for microphone capture, transcription, LLM generation, text insertion, Google/email sign-in and sign-out, account library isolation, Drive sync/conflicts, checkout/refunds and admin access. Packaging checks alone do not verify these behaviors. See `release-status-2026-10-09.md` for provider integration, macOS signing and Android release inputs still required.
