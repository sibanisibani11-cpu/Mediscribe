# Backend access check — September 23, 2026

## Continuation — September 24, 2026

### Deployment after explicit approval

The user approved deployment. `mediscribeApi` was created, then updated after live health testing exposed an obsolete Firebase Admin namespace API. `server/index.js` now uses modular app/auth/firestore imports; a regression starts the handler with the actual installed SDK and synthetic secrets without provider requests. `npm run verify` passes all 77 tests, TypeScript, lint and client security checks.

Verified backend: `https://mediscribeapi-nmnwspke5q-uc.a.run.app`. Live checks pass: health 200, missing authentication 401, invalid webhook signature 401, disallowed origin 403 and allowed-origin preflight 204. The URL is saved in local `.env`, public client configuration generation succeeds, and the subsequent client security check passes. These probes created no payment or customer records.

Firebase reports successful function deployment but exits 1 because no Artifact Registry cleanup policy is configured in us-central1. Image retention remains a separate maintenance item; no automatic deletion policy was introduced. Razorpay dashboard sign-in and webhook registration remain pending. Target webhook URL: `https://mediscribeapi-nmnwspke5q-uc.a.run.app/v1/webhooks/razorpay`; events: `payment.captured` and `refund.processed`; use the existing Secret Manager webhook secret without printing it. No release, customer migration, database rule change or live purchase test was performed.

The deployment-pending account below is historical and superseded by this successful deployment.

Recovered the previous task's explicit provisioning approval and successful provisioning run. Fresh read-only checks confirm all four required secrets exist, billing is enabled, Cloud Functions listing succeeds with no deployed functions, and Razorpay live API authentication succeeds. Secret values were not printed.

`npm run verify` passes TypeScript, lint (warnings only), all 76 tests, and client security checks. Deployment of only `functions:mediscribe:mediscribeApi` was blocked by automatic approval review before execution: explicit deployment authorization is required for the billed payment backend. No deployment or payment/customer mutation occurred in this continuation. The Razorpay dashboard redirects to sign-in; webhook setup remains pending dashboard access and a verified backend URL. The earlier provisioning-pending notes below are historical and superseded by this section.

Read-only checks verified the configured project `studio-1170771809-75956` using the saved Firebase CLI login.

- Firebase project billing is enabled.
- Secret Manager access succeeds; no secrets are currently configured.
- Cloud Functions listing fails because its API is disabled (`SERVICE_DISABLED`), not because the saved login expired.
- Existing Razorpay live credentials authenticate successfully. The check discarded the response body and did not create/change payments or display payment records.

## Prepared action, awaiting explicit approval

`scripts/prepare-backend.js` is prepared and syntax checked but has not run. It will enable Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Eventarc, Pub/Sub and Secret Manager for this project; copy the existing Razorpay key ID/secret to Secret Manager; generate an Ed25519 signing key and random webhook secret there; and save only the public signing key and allowed-origin configuration locally. Existing cloud secret versions are preserved on retries. Enabling/using these services can incur charges on the existing billing account. The script uses the Firebase CLI installation on this Mac.

Automatic approval review rejected the execution because the specific persistent cloud provisioning and live-credential transfer need explicit user authorization. No remote mutation occurred. No backend deployment, webhook registration, Firestore rule change, administrator-role change or customer migration has been performed.

After approval, provision the services/secrets, validate and deploy only the new backend function, verify its health/authentication behavior, and save its verified URL into the public client configuration. Configure Razorpay to deliver `payment.captured` and `refund.processed` to that backend with the matching webhook secret. Published-client database rules and customer migration need a coordinated release cutover rather than an incidental change during access setup.

Provider references: [Firebase environment and secrets](https://firebase.google.com/docs/functions/config-env), [Razorpay webhook settings](https://razorpay.com/docs/payments/dashboard/account-settings/webhooks/).

## Webhook verification — September 25, 2026

After the user completed secret entry and creation, the signed-in Razorpay live-mode dashboard confirms webhook `TgFDgTmC0vQGx3` is Enabled at `https://mediscribeapi-nmnwspke5q-uc.a.run.app/v1/webhooks/razorpay`, with exactly `payment.captured` and `refund.processed` active. The details report that a secret was provided; its value was not read or exposed. The older webhook for project `studio-5639723232-90dda` remains Disabled. This verifies saved configuration, not successful signed event delivery or equality of the entered secret to Secret Manager. End-to-end payment/refund delivery validation remains outstanding.

## Local preview checkout — September 26, 2026

Reproduced checkout preflight HTTP 403 for Origin `http://localhost:9002`. Added that exact origin to the backend environment and provisioning script, then successfully updated the function. Live checks now return preflight 204 with matching allow-origin; unauthenticated POST /v1/orders returns 401 with CORS headers; an untrusted origin remains 403. No orders or payments were created. Firebase CLI again reported successful update followed by the separate missing artifact-cleanup-policy warning/error. Authenticated checkout and payment completion remain unverified.
