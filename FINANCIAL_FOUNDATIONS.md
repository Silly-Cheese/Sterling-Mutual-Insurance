# Sterling Financial Foundations — Phase 1 of 6

This new opt-in Firestore financial posting module is shared conceptually between Sterling Motors and Sterling Mutual, while keeping separate Firebase projects and data.

- All amounts use integer cents. Never store financial balances as floating-point dollars.
- `issueInvoice`, `payInvoice`, `reversePayment`, `recordCredit`, `refundCredit` write immutable balanced journals.
- Invoices and journal writes occur in one Firestore transaction; operation IDs prevent duplicate submissions.
- `reconcileJournals` recomputes ledger account balances for diagnostics.
- Operations should use unique, stable IDs generated before a retry.
- A payment is recorded in RP. This module does **not** charge a real card or process funds.
- Refunds verify available unapplied customer credit using an atomic customer-credit balance; existing legacy credits are not migrated. Refunds still require manager approvals and appropriate payment-settlement controls before production usage.
- Existing billing, loan, or premium records remain unchanged until migration and UI integration are completed.
- Financial collections: `financialInvoices`, `financialOperations`, `financialJournals`, , `financialReversals`, and `financialCustomerCredits`.
- Deploy the updated Firestore rules before attempting writes.
- For real-world payments, move financial posting and authorization checks to a trusted backend and use your payment provider's server-side verification. Browser-side finance permissions are insufficient for a production payment processor.

Example:

```js
import { issueInvoice, payInvoice, cents } from "./financial/core.js";
await issueInvoice(db, {
  operationId: crypto.randomUUID(), actorUid: staff.uid,
  customerId, description: "Service invoice",
  amountCents: cents(125.50), dueDate: "2026-11-01"
});
```

**Not yet included:** automatic invoice migration, integrated billing UI, payment allocations across invoices, dedicated refund authorization, or real financial processor integration. These are required before calling Phase 1 fully deployed.
