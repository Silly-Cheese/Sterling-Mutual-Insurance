import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("pending customers are offered self-service onboarding rather than blocked",()=>{
  const app=source("src/App.jsx");
  assert.match(app,/CustomerOnboarding/);
  assert.match(app,/account\?\.accountType==="customer"&&account\.accessStatus==="pending"/);
  assert.match(app,/onRegistered\(credential\.user\)/);
});

test("customer profile, portal and access status are written atomically",()=>{
  const component=source("src/pages/CustomerOnboarding.jsx");
  assert.match(component,/const batch=writeBatch\(db\)/);
  assert.match(component,/batch\.set\(customerRef,/);
  assert.match(component,/batch\.set\(customerAccountRef,/);
  assert.match(component,/batch\.update\(accountRef,/);
  assert.match(component,/await batch\.commit\(\)/);
  assert.match(component,/source:"self_service"/);
  assert.match(component,/status:"prospect"/);
});

test("Firestore rules require self-owned account, a fresh record and matching batch state",()=>{
  const rules=source("firestore.rules");
  for(const required of [
    'function canCreateOwnCustomerRecord(customerId)',
    'function canCreateOwnCustomerPortal(uid)',
    'function canFinishOwnCustomerSignup(uid)',
    'account.accountType == "customer"',
    'account.accessStatus == "pending"',
    'd.source == "self_service"',
    'd.authUid == request.auth.uid',
    'd.createdAt == request.time',
    'portalAfter.customerId == customerId',
    'accountAfter.customerId == customerId',
    'allow create: if hasPermission("customer.create") || canCreateOwnCustomerRecord(customerId);',
    'allow create: if canCreateOwnCustomerPortal(uid)',
    'allow update: if canFinishOwnCustomerSignup(uid)'
  ]) assert.ok(rules.includes(required), "Missing rule contract: "+required);
  assert.match(rules,/d\.email == request\.auth\.token\.email\.lower\(\)/);
});

test("customers cannot self-issue policies or pay claims through account setup",()=>{
  const component=source("src/pages/CustomerOnboarding.jsx");
  assert.doesNotMatch(component,/collection\(db,"policies"\)/);
  assert.doesNotMatch(component,/collection\(db,"claims"\)/);
  assert.doesNotMatch(component,/collection\(db,"claimPayments"\)/);
  const rules=source("firestore.rules");
  assert.match(rules,/allow create: if hasPermission\("policy\.issue"\)/);
  assert.match(rules,/allow create: if hasPermission\("claim\.payment"\)/);
});
