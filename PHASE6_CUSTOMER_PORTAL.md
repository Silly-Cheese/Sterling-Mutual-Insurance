# Sterling Phase 6 of 6 — Customer Self-Service

Phase 6 branches are based on `release/sterling-phases-1-to-5`; this ensures earlier integrated changes remain included.

## Sterling Motors
- Customer dashboard for signed-in, linked customer records.
- Request assistance with bills, payments, service scheduling, or documents.
- Customer-owned request read/create rules; employees can manage submissions.
- Requests do not charge cards, alter payment balances, or schedule work automatically.
- Records require an existing `customers.linkedUid` link. Customers without a link receive onboarding guidance.

## Sterling Mutual
- Existing customer portal continues to show policies, claims, invoices, transactions, document acknowledgements, and service requests.
- Invoice section now shows outstanding totals and overdue count.
- Customers can submit assistance requests linked to a specific invoice.
- Payment assistance is a service request, **not an actual payment**.

## Still required before production
- Validate rules with Firebase Emulator; verify ownership and cross-customer denial.
- Run automated builds and user acceptance tests.
- Connect a trusted payment provider/server for actual payment processing.
- Review existing staff/client access to all customer data, including customer linkage.
- Add downloadable document delivery and real appointment confirmation workflows.
- Complete finance migration and approval UI integration from earlier phases.

Do not claim that a payment has been collected when a customer only requested assistance.
