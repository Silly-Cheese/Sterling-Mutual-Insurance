# Phase 5 of 6 — Reporting & Administration

This phase adds deterministic reporting at `src/reports/metrics.js` and operational indicators in the existing manager dashboards.

**Motor Group:** closed deals, gross deal value, posted payment volume, outstanding finance, default/overdue accounts, repair orders, estimate totals, acquisitions, and active staff.
**Mutual:** active policies, open claims, open reserves, recorded payments/refunds, outstanding invoice balances, active staff, and audit attribution quality.

The utilities support inclusive date filters on records with usable timestamps. The new dashboard indicators use available loaded data and do not represent comprehensive company-wide, audited financial statements. Exports use CSV escaping including basic spreadsheet-formula injection mitigation.

## Before release
- Verify field mappings against real RP records and missing legacy fields.
- Implement server-side aggregation or approved summary collections for large datasets.
- Ensure collection reads remain limited to authorized staff (especially billing and audit).
- Add complete finance reconciliation, staff-level access policy management, report exports UI, date filters, and report-specific tests.
- Integrate these branches with Phases 1–4, whose draft changes remain separate.
- Run production build, Firestore emulator checks, and user acceptance tests.

No new live accounting postings, database migrations, or live permissions changes were performed in this phase.
