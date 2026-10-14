import test from "node:test";
import assert from "node:assert/strict";
import {summarizeMotors,summarizeMutual,csvExport} from "../src/reports/metrics.js";
test("Motor receivables and payment volumes are tracked independently",()=>{
 const out=summarizeMotors({deals:[{stage:"complete",finalPrice:20000,createdAt:"2026-10-01"}],
 paymentAccounts:[{currentBalance:15000,status:"active"}],
 paymentTransactions:[{amount:500,createdAt:"2026-10-01"}],staff:[]});
 assert.equal(out.grossDealValue,20000);assert.equal(out.postedPaymentVolume,500);assert.equal(out.outstandingFinanceBalance,15000);
});
test("Mutual reserves and premium collections are tracked separately",()=>{
 const out=summarizeMutual({policies:[{status:"active"}],claims:[{status:"open",reserveAmount:3500}],
 billingTransactions:[{type:"payment",status:"posted",amount:175,createdAt:"2026-10-01"}],
 billingInvoices:[{status:"open",balanceDue:85}]});
 assert.equal(out.claimReserves,3500);assert.equal(out.recordedPremiumPayments,175);assert.equal(out.openInvoiceBalance,85);
});
test("CSV output neutralizes spreadsheet-formula strings",()=>{
 assert.match(csvExport([{name:"=HYPERLINK(foo)"}],["name"]),/'=HYPERLINK/);
});
