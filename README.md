# Sterling Mutual Insurance

A full insurance roleplay operations platform.

## Part 1 of 4 — Foundation

Part 1 establishes the company platform before the insurance engines are added.

### Included
- Responsive Sterling Mutual staff interface
- Firebase Authentication
- Firestore connection
- One-time secure founder bootstrap
- Founder / System Owner account provisioning
- Capability-based staff permissions
- Firestore security rules
- Executive dashboard shell
- Customer registry
- Staff-created customers that do not require portal accounts
- Audit-log foundation
- Navigation placeholders for quotes, policies, claims, billing, and company finance

## 1. Configure the web app

Copy `.env.example` to `.env.local` and fill in the Firebase web configuration values from your Firebase project.

```bash
cp .env.example .env.local
npm install
npm run dev
```

The Firebase web configuration is client configuration. The bootstrap credential is intentionally **not** stored there.

## 2. Enable Firebase Authentication

In Firebase Console:

**Authentication → Sign-in method → Email/Password → Enable**

Do not manually create the founder account. The bootstrap function creates it for you.

## 3. Set the private bootstrap code

Install the Firebase CLI and authenticate, then run:

```bash
firebase functions:secrets:set BOOTSTRAP_SECRET
```

When prompted, enter your private bootstrap code.

The secret is stored by Firebase and is never committed to this repository.

## 4. Deploy the backend and rules

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

## 5. Bootstrap Sterling Mutual

Start or deploy the web application, open:

```
/bootstrap
```

Enter:
- Bootstrap code
- Founder name
- Founder email
- Password

The server automatically:
1. verifies the secret,
2. locks bootstrap so only one initialization can run,
3. creates the Firebase Auth user,
4. assigns System Owner custom claims,
5. creates employee **SMI-000001**,
6. creates the founder staff profile,
7. writes the first audit event,
8. permanently closes successful bootstrap access.

You never need to find or enter a Firebase UID.

## Architecture roadmap

**Part 1:** Foundation, authentication, staff permissions, customers  
**Part 2:** Quotes, applications, underwriting, policies, insured assets  
**Part 3:** Claims, adjusters, evidence, reserves, settlements, SIU  
**Part 4:** Billing, company finance, analytics, documents, administration

## Security note

Never place the bootstrap code, service-account keys, or other server credentials in browser source, `.env.example`, or GitHub.


## Part 2 of 4 — Insurance Engine

Part 2 adds the first complete insurance lifecycle:

```
Customer
   ↓
Quote
   ↓
Application submitted
   ↓
Underwriting review
   ↓
Approved / information requested
   ↓
Policy issuance
   ↓
Insured vehicle/property record
```

### Quote builder
Agents can:
- select an existing customer,
- choose Auto, Home/Property, or Commercial,
- identify the insured asset,
- select deductible and coverage limits,
- record underwriting/risk notes,
- calculate an RP monthly and six-month premium,
- save a draft,
- submit it to underwriting.

### Underwriting
Authorized underwriters can:
- view submitted applications,
- request additional information,
- approve applications,
- return applications to the agent for resubmission.

### Policy administration
Authorized staff can:
- bind approved applications,
- generate a Sterling Mutual policy number,
- create the insured-asset record,
- establish effective and expiration dates,
- view premiums, deductibles, limits, and insured property,
- cancel and reinstate policies.

### Part 2 permission capabilities
- `quote.read`
- `quote.create`
- `quote.update`
- `quote.submit`
- `underwriting.review`
- `policy.read`
- `policy.issue`
- `policy.update`
- `asset.manage`

The Founder/System Owner continues to bypass individual capability checks through the existing system-owner claim.

### Deploy Part 2 rules

After pulling Part 2, redeploy Firestore rules:

```bash
firebase deploy --only firestore:rules
```

No composite Firestore indexes are required by the Part 2 implementation.


## Part 3 of 4 — Claims & Special Investigations

Part 3 adds:
- staff-filed claims for customers,
- first notice of loss intake,
- claim status and coverage decisions,
- claim reserves,
- settlement recording,
- claim closure,
- claim event history storage,
- evidence data model,
- SIU referral authority,
- SIU investigation queue,
- investigation risk scoring and notes,
- investigation outcomes.

### Part 3 permissions
- `claim.read`
- `claim.createForCustomer`
- `claim.update`
- `claim.assign`
- `claim.reserve`
- `claim.decide`
- `claim.settle`
- `claim.close`
- `claim.evidence`
- `siu.read`
- `siu.refer`
- `siu.manage`

Deploy the updated rules after pulling:

```bash
firebase deploy --only firestore:rules
```

No composite indexes are required.


## Part 4 of 4 — Billing, Finance, Administration & Final Operations

Part 4 completes the main Sterling Mutual operations platform.

### Billing
The Billing workspace now supports:
- policy billing accounts,
- premium payments,
- charges,
- credits,
- refunds,
- account balances,
- current / late / grace-period / cancellation-pending statuses,
- transaction notes,
- employee attribution.

### Company Finance
The Company workspace now calculates RP operating metrics from internal records:
- written premium,
- premium collected,
- refunded premium,
- claims paid,
- outstanding claim reserves,
- available operating capital,
- paid loss ratio.

These figures are for the RP system and are not statutory insurance accounting.

### Analytics
The Company area includes operating indicators for:
- active/cancelled policy mix,
- open/settled claim mix,
- billing activity.

### Staff Administration
Authorized administrators can:
- review the staff directory,
- change staff roles using role presets,
- suspend employees,
- terminate employees,
- restore active status,
- update capability sets.

The Founder record is protected by Firestore Rules from client-side role/status modification and other employees cannot be elevated into the Founder role.

### Audit Center
The system includes an audit center for protected administrative event records.

### Document Center
Part 4 adds print-ready document groundwork for:
- policy declarations,
- insurance cards,
- billing receipts,
- cancellation notices,
- renewal notices,
- settlement letters.

The current document center is RP output groundwork and does not generate real legal insurance contracts.

### Live Executive Dashboard
The dashboard now reads real Firestore data for:
- customers,
- active underwriting items,
- policies in force,
- open claims,
- outstanding reserves,
- priority operations queue.

### Part 4 permissions
- `billing.read`
- `billing.manage`
- `finance.read`
- `finance.manage`
- `document.read`
- `document.manage`
- `admin.read`
- `admin.manage`

## Final deployment

After pulling the completed four-part build:

```bash
npm install
npm run build
firebase deploy --only firestore:rules,functions,hosting
```

If hosting is deployed elsewhere, deploy the Vite `dist` output through that provider after `npm run build`.

No composite Firestore indexes are required by the current four-part implementation.
