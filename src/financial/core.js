import {collection, doc, runTransaction, serverTimestamp} from "firebase/firestore";

/**
 * Phase 1 financial posting core. All amounts are integer USD cents.
 * Each posted journal is balanced, immutable and idempotent by operation ID.
 * This is a new opt-in subsystem; legacy collections are not migrated automatically.
 */
export function cents(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid monetary amount.");
  const n = Math.round(value * 100);
  if (!Number.isSafeInteger(n) || Math.abs(value * 100 - n) > 1e-6) throw new Error("Amounts require no more than two decimal places.");
  return n;
}
export const dollars = value => (value / 100).toFixed(2);
function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  return value.trim();
}
function positive(n) {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Amount must be positive integer cents.");
  return n;
}
function balanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("Journal needs at least two lines.");
  const totals = lines.reduce((a, x) => {
    required(x.account, "Ledger account");
    if (!Number.isSafeInteger(x.debitCents || 0) || !Number.isSafeInteger(x.creditCents || 0) ||
      (x.debitCents || 0) < 0 || (x.creditCents || 0) < 0 ||
      (!!x.debitCents === !!x.creditCents)) throw new Error("Invalid journal line.");
    a.debit += x.debitCents || 0; a.credit += x.creditCents || 0; return a;
  }, {debit:0, credit:0});
  if (totals.debit !== totals.credit) throw new Error("Unbalanced journal.");
  return lines;
}
function references(db, operationId) {
  const id = required(operationId, "Operation ID");
  if (id.includes("/")) throw new Error("Operation ID cannot contain slashes.");
  return {
    operation: doc(db, "financialOperations", id),
    journal: doc(db, "financialJournals", id)
  };
}
async function post(db, {operationId, actorUid, customerId, type, lines, invoiceId, amountCents, mutate}) {
  required(actorUid, "Actor");
  required(customerId, "Customer");
  positive(amountCents);
  balanced(lines);
  const refs = references(db, operationId);
  return runTransaction(db, async tx => {
    const existing = await tx.get(refs.operation);
    if (existing.exists()) {
      const x = existing.data();
      if (x.actorUid !== actorUid || x.customerId !== customerId || x.type !== type ||
        x.amountCents !== amountCents || x.invoiceId !== (invoiceId || null))
        throw new Error("Operation ID reused for a different transaction.");
      return {id:operationId, duplicate:true};
    }
    // All reads precede writes. mutate may only read and stage changes.
    const change = mutate ? await mutate(tx) : null;
    tx.set(refs.journal, {operationId, type, customerId, invoiceId:invoiceId || null,
      amountCents, lines, actorUid, status:"posted", createdAt:serverTimestamp()});
    tx.set(refs.operation, {operationId, type, customerId, invoiceId:invoiceId || null,
      amountCents, actorUid, createdAt:serverTimestamp()});
    if (change) change(tx);
    return {id:operationId, duplicate:false};
  });
}
const line = (account, debitCents, creditCents) => ({account,debitCents,creditCents});

/** Issue an invoice and its receivable journal in one atomic operation. */
export async function issueInvoice(db, {operationId, actorUid, customerId, description, amountCents, dueDate}) {
  positive(amountCents); required(description, "Description");
  const invoiceRef = doc(db,"financialInvoices",required(operationId,"Operation ID"));
  return post(db,{operationId,actorUid,customerId,type:"invoice",amountCents,
    invoiceId:invoiceRef.id,
    lines:[line("accounts_receivable",amountCents,0),line("earned_revenue",0,amountCents)],
    mutate:async tx=>{
      const existing = await tx.get(invoiceRef);
      if (existing.exists()) throw new Error("Invoice already exists.");
      return t=>t.set(invoiceRef,{customerId,description:description.trim(),amountCents,
        balanceDueCents:amountCents,paidCents:0,status:"open",dueDate:dueDate || null,
        createdBy:actorUid,createdAt:serverTimestamp()});
    }});
}
/** Apply a payment to one invoice. Excess cash must be posted separately as a credit. */
export async function payInvoice(db, {operationId,actorUid,customerId,invoiceId,amountCents,method="RP payment"}) {
  positive(amountCents); required(invoiceId,"Invoice");
  const invoiceRef = doc(db,"financialInvoices",invoiceId);
  return post(db,{operationId,actorUid,customerId,invoiceId,amountCents,type:"payment",
    lines:[line("cash",amountCents,0),line("accounts_receivable",0,amountCents)],
    mutate:async tx=>{
      const snap = await tx.get(invoiceRef);
      if (!snap.exists()) throw new Error("Invoice not found.");
      const current=snap.data();
      if (current.customerId !== customerId) throw new Error("Customer does not own invoice.");
      if (!["open","partially_paid"].includes(current.status)) throw new Error("Invoice is not payable.");
      if (amountCents > current.balanceDueCents) throw new Error("Payment exceeds invoice balance.");
      const balance = current.balanceDueCents-amountCents;
      return t=>t.update(invoiceRef,{balanceDueCents:balance,paidCents:(current.paidCents||0)+amountCents,
        status:balance===0?"paid":"partially_paid",lastPaymentMethod:method,updatedAt:serverTimestamp()});
    }});
}
/** Reverse a posted payment without deleting the audit trail. Requires original payment details. */
export async function reversePayment(db,{operationId,actorUid,customerId,invoiceId,originalOperationId,reason}) {
  required(reason,"Reversal reason"); required(originalOperationId,"Original operation ID");
  const originalRef=doc(db,"financialOperations",originalOperationId);
  const reversalMarker=doc(db,"financialReversals",originalOperationId);
  // Read the source first; marker and invoice are revalidated inside the transaction.
  const refs=references(db,operationId);
  return runTransaction(db,async tx=>{
    const [op,source,marker,invoice]=await Promise.all([
      tx.get(refs.operation),tx.get(originalRef),tx.get(reversalMarker),
      tx.get(doc(db,"financialInvoices",invoiceId))
    ]);
    if(op.exists()) {
      if(op.data().type!=="payment_reversal" || op.data().originalOperationId!==originalOperationId)
        throw new Error("Operation ID conflict.");
      return {id:operationId,duplicate:true};
    }
    if(!source.exists() || source.data().type!=="payment" ||
      source.data().customerId!==customerId || source.data().invoiceId!==invoiceId)
      throw new Error("Original payment not found.");
    if(marker.exists()) throw new Error("Payment already reversed.");
    if(!invoice.exists() || invoice.data().customerId!==customerId) throw new Error("Invoice not found.");
    const n=source.data().amountCents; positive(n);
    const current=invoice.data();
    balanced([line("accounts_receivable",n,0),line("cash",0,n)]);
    tx.set(refs.journal,{operationId,type:"payment_reversal",customerId,invoiceId,amountCents:n,
      originalOperationId,reason,actorUid,status:"posted",
      lines:[line("accounts_receivable",n,0),line("cash",0,n)],createdAt:serverTimestamp()});
    tx.set(refs.operation,{operationId,type:"payment_reversal",customerId,invoiceId,
      amountCents:n,originalOperationId,actorUid,createdAt:serverTimestamp()});
    tx.set(reversalMarker,{reversalOperationId:operationId,actorUid,createdAt:serverTimestamp()});
    const balance=current.balanceDueCents+n;
    tx.update(doc(db,"financialInvoices",invoiceId),{balanceDueCents:balance,
      paidCents:(current.paidCents||0)-n,status:balance===current.amountCents?"open":"partially_paid",
      updatedAt:serverTimestamp()});
    return {id:operationId,duplicate:false};
  });
}
/** Unapplied customer credits are liabilities, not revenue. */
export function recordCredit(db,{operationId,actorUid,customerId,amountCents}) {
  positive(amountCents);
  const creditRef=doc(db,"financialCustomerCredits",required(customerId,"Customer"));
  return post(db,{operationId,actorUid,customerId,amountCents,type:"unapplied_credit",
    lines:[line("cash",amountCents,0),line("customer_credits",0,amountCents)],
    mutate:async tx=>{
      const current=await tx.get(creditRef);
      const balance=current.exists()?current.data().availableCents:0;
      if(!Number.isSafeInteger(balance)||balance<0) throw new Error("Invalid credit balance.");
      return t=>t.set(creditRef,{customerId,availableCents:balance+amountCents,
        updatedAt:serverTimestamp()},{merge:true});
    }});
}
/** Refund only available unapplied credit, enforcing balance in the posting transaction. */
export function refundCredit(db,{operationId,actorUid,customerId,amountCents}) {
  positive(amountCents);
  const creditRef=doc(db,"financialCustomerCredits",required(customerId,"Customer"));
  return post(db,{operationId,actorUid,customerId,amountCents,type:"credit_refund",
    lines:[line("customer_credits",amountCents,0),line("cash",0,amountCents)],
    mutate:async tx=>{
      const current=await tx.get(creditRef);
      const balance=current.exists()?current.data().availableCents:0;
      if(!Number.isSafeInteger(balance)||balance<amountCents) throw new Error("Insufficient unapplied credit.");
      return t=>t.update(creditRef,{availableCents:balance-amountCents,updatedAt:serverTimestamp()});
    }});
}
/** Recompute each account's signed balance from immutable posted journals. */
export function reconcileJournals(journals) {
  const totals=new Map();
  for(const journal of journals) {
    if(journal.status!=="posted") continue;
    balanced(journal.lines);
    for(const item of journal.lines)
      totals.set(item.account,(totals.get(item.account)||0)+(item.debitCents||0)-(item.creditCents||0));
  }
  return Object.fromEntries([...totals.entries()].sort(([a],[b])=>a.localeCompare(b)));
}
