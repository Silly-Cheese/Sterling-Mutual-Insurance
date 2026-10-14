// Phase 5: permission-aware, deterministic reporting helpers.
// Figures summarize supplied records only. They are not audited financial statements.
const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
const sum=(rows,field)=>rows.reduce((total,row)=>total+num(row[field]),0);
const date=value=>{if(!value)return null;const d=value.toDate?value.toDate():value.seconds?new Date(value.seconds*1000):new Date(value);return Number.isNaN(d.getTime())?null:d};
export const between=(record,from,to,field="createdAt")=>{
 const d=date(record[field]);if(!d)return false;
 return (!from||d>=new Date(from+"T00:00:00"))&&(!to||d<=new Date(to+"T23:59:59.999"));
};
export function summarizeMotors({deals=[],paymentAccounts=[],paymentTransactions=[],repairOrders=[],vehicleAcquisitions=[],staff=[]},range={}){
 const filtered=(rows,field="createdAt")=>rows.filter(x=>between(x,range.from,range.to,field));
 const closed=filtered(deals).filter(d=>d.stage==="complete");
 const payments=filtered(paymentTransactions,"createdAt");
 const service=filtered(repairOrders);
 const accounts=paymentAccounts;
 return {
  closedDeals:closed.length,
  grossDealValue:closed.reduce((s,d)=>s+num(d.finalPrice||d.price),0),
  postedPaymentVolume:sum(payments,"amount"),
  outstandingFinanceBalance:accounts.reduce((s,a)=>s+num(a.currentBalance),0),
  overdueOrDefaultedAccounts:accounts.filter(a=>["defaulted","late","overdue"].includes(a.status)).length,
  openRepairOrders:repairOrders.filter(r=>!["closed","cancelled"].includes(r.status)).length,
  serviceEstimateValue:sum(service,"estimateTotal"),
  acquisitions:filtered(vehicleAcquisitions).length,
  activeStaff:staff.filter(s=>s.isStaff&&s.status==="active").length,
  warning:"Deal totals, service estimates, and payment volumes are different measures and must not be added together."
 };
}
export function summarizeMutual({policies=[],claims=[],billingTransactions=[],billingInvoices=[],staff=[]},range={}){
 const filtered=(rows,field="createdAt")=>rows.filter(x=>between(x,range.from,range.to,field));
 const transactions=filtered(billingTransactions);
 const paid=transactions.filter(t=>["payment","premium_payment"].includes(t.type)&&t.status!=="reversed");
 const refund=transactions.filter(t=>t.type==="refund"&&t.status!=="reversed");
 return {
  activePolicies:policies.filter(p=>p.status==="active").length,
  openClaims:claims.filter(c=>!["closed","denied","settled"].includes(c.status)).length,
  claimReserves:sum(claims.filter(c=>!["closed","denied"].includes(c.status)),"reserveAmount"),
  recordedPremiumPayments:sum(paid,"amount"),
  recordedRefunds:sum(refund,"amount"),
  openInvoiceBalance:billingInvoices.filter(i=>!["void","cancelled"].includes(i.status)).reduce((s,i)=>s+num(i.balanceDue),0),
  activeStaff:staff.filter(s=>s.status==="active").length,
  warning:"RP operational estimates only; not statutory insurance accounting or audited balances."
 };
}
export function auditCoverage({audit=[],staff=[]}){
 const actorIds=new Set(staff.map(s=>s.id).filter(Boolean));
 return {events:audit.length,missingActor:audit.filter(x=>!x.actorUid&&!x.createdBy).length,
  unknownStaffActors:audit.filter(x=>(x.actorUid||x.createdBy)&&!actorIds.has(x.actorUid||x.createdBy)).length};
}
export function csvExport(rows,fields){
 const escape=value=>'"'+String(value??"").replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';
 return [fields.map(escape).join(","),...rows.map(row=>fields.map(field=>escape(row[field])).join(","))].join("\r\n");
}
