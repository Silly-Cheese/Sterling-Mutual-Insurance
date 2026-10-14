# Sterling Phase 4 — Automation and Approvals

An opt-in approval workflow module has been introduced at `src/workflows/approvals.js`.

## Available
- Idempotent, atomic approval request and linked task creation by stable operation ID.
- Two-person review: the requester cannot resolve their own request.
- Pending → approved/rejected review decisions and completed task state in one transaction.
- Priority diagnostics for due, overdue, and closed tasks.
- Basic Firestore restrictions for authenticated staff, record immutability, and manager decisions.
- No requirement for composite indexes.

## Integration required
Existing screens do **not** yet invoke this module. Hook dealership finance/deal/service approvals and insurance billing/policy/claim approvals into their respective screens after confirming each franchise's actual permission map.

Review authorization is deliberately distinct from changing source records. An approval decision alone does not settle a claim, change a vehicle deal, issue a policy or move money.

No scheduler, email notifications, escalation worker, production deployment, or automated test suite is included yet. Client-side queues only display results when explicitly loaded. A trusted backend is needed for tamper-resistant approvals and scheduled escalations; the current Firestore Rules are minimum protections, not complete financial authorization.

## Operations to validate
- Create request, retry same operation ID, reject ID collisions.
- Ensure requester cannot approve their own request.
- Ensure unauthorized users cannot update approvals.
- Ensure one reviewed request cannot be resolved twice.
- Verify Firestore Rules emulator, stale writes, and business record linkage.
- Validate approval types, amount thresholds, escalation contacts and permissions before merging.
