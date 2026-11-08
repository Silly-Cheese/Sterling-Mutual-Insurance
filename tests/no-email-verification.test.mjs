import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("Sterling email/password signup does not enforce email verification",()=>{
  const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const rules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
  assert.match(app,/createUserWithEmailAndPassword/);
  assert.match(app,/signInWithEmailAndPassword/);
  assert.doesNotMatch(app,/\b(?:sendEmailVerification|emailVerified|applyActionCode|checkActionCode)\b/);
  assert.doesNotMatch(rules,/\b(?:email_verified|emailVerified)\b/);
});
