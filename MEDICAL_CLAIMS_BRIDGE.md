# Sterling Mutual × Northstar Medical Claims Bridge (Roleplay)

This is a **Firebase Authentication + Firestore Rules + client-side** workflow. It adds **no Cloud Functions**.

## What is implemented

- Sterling customer portal: **Medical Payouts** tab, with policy selection, provider, service date, invoice number, category, amount, details, status history and replies to requests for information.
- Customer onboarding: new customers create their **own** prospect customer record immediately after signup, without staff linking. A dedicated form collects their name and optional phone. Existing customer records or policies are never claimed automatically.
- Sterling provider portal: new registrants select **Medical provider**, enter the practice name, and remain blocked until staff verifies and approves them.
- Sterling Company > Staff: approve/suspend provider access; customer registration can be linked to an existing customer record from Customers > Open customer account.
- Sterling staff: **Medical Payouts** intake queue; check provider/patient/policy, ask for information, decline, or convert to an ordinary claim. The ordinary Claims engine handles coverage, investigation, approval and simulated settlement/payment.
- Sterling quotes: **Medical / Health** coverage option for medical policies.
- Northstar Billing: invoice action **Request payout via Sterling Mutual** opens the Sterling portal with a nonclinical invoice reference and editable expected amount.

## Security boundaries

Sterling Mutual and Northstar use different Firebase projects and Auth user stores. Firestore rules from one project **cannot** read or validate Auth users or Firestore documents from the other. The Northstar button is an **interactive handoff**, not an automated cross-project API or a verified EDI claim.

- Northstar sends **no patient name, clinical details, chart notes, tokens, or login credentials** through its link.
- A provider must have a **Sterling Auth account** and a staff-approved `providerAccounts/{uid}` record to submit claims.
- Customer submissions require ownership of their Sterling customer record. Policy IDs, when supplied by a customer, must belong to that record.
- Self-registration uses a single Firestore batch for `customers/{newId}`, `customerAccounts/{uid}` and `accounts/{uid}`. Rules validate the Auth UID, account type, pending status, fixed prospect status and matching linked records with `getAfter()`. Customers can later edit only their contact phone.
- Provider submissions are not automatically linked to a customer or policy; Sterling staff must verify the match. Provider-supplied policy numbers and amounts are untrusted.
- Portal users cannot create official `claims`, `claimPayments`, coverage decisions, or settlement records. They can only create schema-validated `medicalClaimRequests` and append replies when staff requests more information.
- Staff conversion uses a Firestore transaction that creates the official claim and marks the intake request converted together. Rules verify the resulting claim link.
- No automatic payout or payment sync to Northstar. Record simulated insurance payments in Northstar separately after Sterling adjudication.
- Roleplay data only. Do **not** use this integration with real PHI, real payment processing, or actual insurance coverage without a compliant backend and regulatory/security review.

## Firestore collections

- `accounts`: registration `accountType` (`staff`, `customer`, `provider`) and pending status.
- `providerAccounts/{authUid}`: approved/suspended practice access controlled by Sterling staff.
- `customerAccounts/{authUid}`: existing customer portal link; staff may link a previously self-registered customer.
- `medicalClaimRequests/{id}`: immutable customer/provider intake record, mutable review status/claim link only by authorized staff.
- `medicalClaimResponses/{id}`: append-only replies to `needs_info` requests.
- `claims/{id}`: official Sterling claim created on verified conversion, using `lossType: "medical_expense"`.

## Deploy Sterling Mutual (Windows PowerShell)

From a local checkout of `Silly-Cheese/Sterling-Mutual-Insurance`:

```powershell
git pull origin main
npm.cmd install
npm.cmd run build
firebase.cmd deploy --project sterling-mutual-insurance --only firestore:rules,hosting
```

This deploys **only** Firestore rules and the web frontend. It does not deploy Functions.

For a first-time installation, enable **Email/Password Authentication** and initialize the Sterling company as required by the existing app. A staff member needs `staff.manage` to approve providers, and a claims reviewer needs `claim.read` and `claim.createForCustomer` to convert requests.

## Publish the Northstar side

The changes to `Silly-Cheese/doctor-rp` are a frontend-only addition to `northstar-billing.js`. Publish the updated static site using Northstar's current hosting workflow. Do **not** deploy new Functions or Northstar rules for this bridge.

The Northstar invoice button currently targets:

```
https://sterling-mutual-insurance.web.app/
```

This is the expected Firebase Hosting URL for the Sterling project. If the live portal uses another hostname, edit `STERLING_MEDICAL_PORTAL` near the top of `northstar-billing.js`. Verify that the Sterling frontend is deployed and reachable before testing the handoff.

## Acceptance test

1. In Sterling, register with **Medical provider**, sign out, and verify that portal access is blocked while pending.
2. Sign in as a Sterling administrator; visit **Company > Staff** and approve the verified provider.
3. Sign back in as that provider; confirm that only provider-owned medical requests are available.
4. In Northstar, open an invoice from **Billing & Revenue**, choose **Request payout via Sterling Mutual**, and check that the invoice reference and amount prefill the Sterling form *without a patient name*.
5. Fill in the missing patient information, date of service, policy number when known, and submit. It should appear as **submitted**.
6. Sign in as Sterling claims staff and open **Medical Payouts**. Ask for more information and have the submitter reply; check that the response appears in staff review.
7. Match an eligible policy, create the official claim, then verify the intake record says **converted** and that the ordinary Claims page contains the new medical claim.
8. Make any simulated coverage decision/payment through Sterling's existing Claims workflow. Reconcile Northstar manually as needed.
9. Register as **Customer** and complete the self-service profile form. Confirm that the customer portal opens immediately, without an email-verification link or staff linking.
10. Submit a medical request and confirm that its history loads by the signed-in `submitterUid` without permissions errors.
11. Confirm that a customer cannot create a second linked customer with the same account or access a different customer's policies or records.

**Deploy note:** code changes in GitHub do not imply Firebase rules or Hosting have been deployed. The deployment commands above must complete before you can test the live portal.
