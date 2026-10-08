# Historical payment migration

Use `POST /v1/admin/migrate-legacy` with a short-lived Firebase ID token belonging to an account with the `admin` custom claim. The endpoint verifies that the target UID exists in Firebase Auth and fetches the payment directly from Razorpay. A database profile's activation flag, email, or payment reference alone is not proof of ownership.

Before importing, verify the purchaser's original receipt against the provider record and independently establish the target Firebase account. Record the verification in a support case. Do not infer a plan from the paid amount: historical discounts and prices differ.

Request fields:

```json
{
  "uid": "verified-target-firebase-uid",
  "paymentId": "pay_verifiedProviderId",
  "plan": "yearly",
  "reason": "Purchaser receipt and target account ownership verified in support case",
  "evidenceReference": "support-case-reference"
}
```

These are placeholders, not an executable assignment. Keep customer records and authentication tokens out of source control and logs.

For payments with a provider order, the backend verifies the order, amount, and currency. For historical payments without an order, the provider's `notes.billing` or `notes.plan` must explicitly match the requested monthly/yearly term; conflicting notes are rejected. Both paths require a captured, fully unrefunded payment, positive integer minor-unit amount, currency code, and valid original timestamp. Previously recorded refunds block import even if the provider snapshot is stale.

The transaction records the payment, verified target UID, administrator UID, reason, evidence reference, and import time. An orderless payment retains `orderId: null`; no fictional order is created. Access is calculated from the original purchase date using the existing 30-day/monthly or 365-day/yearly terms. Old purchases may therefore already be expired. Repeating the same import does not extend access or replace the original evidence; reassignment to a different account or plan is rejected.

After import, inspect the authenticated payment export and entitlement for the target account. `POST /v1/admin/reconcile` with `paymentId` also supports imported orderless payments, including recovery of partial or full refunds. Customer reconciliation remains restricted to the assigned account. Refund processing is monotonic: a stale captured snapshot cannot restore a revoked payment grant.

This endpoint does not charge, capture, or refund money. It does change the payment ledger and account access, so run it only after completing the ownership review. The known April 27, 2026 payment has not been assigned by the October 8 code change.
