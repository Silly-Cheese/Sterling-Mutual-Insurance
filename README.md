# Sterling Mutual Insurance

Insurance RP management platform.

## Part 1 — Foundation
- React/Vite application shell
- Firebase Authentication + Firestore
- One-time secure founder bootstrap
- Staff/customer foundations
- Capability-based permissions
- Executive dashboard
- Firestore security rules

### Local setup
```bash
npm install
npm run dev
```

### Firebase Functions
```bash
cd functions
npm install
firebase functions:secrets:set BOOTSTRAP_SECRET
firebase deploy --only functions
```

Set the secret value interactively. Do **not** commit the bootstrap code to this repository.

### Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```
