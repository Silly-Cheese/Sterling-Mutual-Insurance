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
