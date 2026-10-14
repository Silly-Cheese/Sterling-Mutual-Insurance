/* Sterling Mutual Phase 3: advisory workflow readiness.
   These checks do not bind coverage, authorize payment or change policy status. */
export function policyReadiness({quote={},policy={}}={}){
  const data={...quote,...policy};
  const checks=[
    {key:"customer",label:"Customer linked",ok:!!data.customerId},
    {key:"asset",label:"Insured asset described",ok:!!(data.assetDescription||data.vehicleId||data.assetId||data.propertyAddress||data.vehicleDescription)},
    {key:"premium",label:"Premium specified",ok:Number(data.monthlyPremium||data.termPremium)>0},
    {key:"effective",label:"Effective date specified",ok:!!data.effectiveDate},
    {key:"expiry",label:"Expiration date specified",ok:!!data.expirationDate},
    {key:"underwriting",label:"Underwriting approved",ok:["approved","bound","issued"].includes(data.underwritingStatus||data.status)}
  ];
  return {ready:checks.every(x=>x.ok),checks,missing:checks.filter(x=>!x.ok).map(x=>x.label)};
}
export function claimReadiness({claim={},payments=[]}={}){
  const claimPayments=payments.filter(p=>p.claimId===claim.id);
  const checks=[
    {key:"policy",label:"Policy linked",ok:!!claim.policyId},
    {key:"loss",label:"Loss reported",ok:!!(claim.lossDate||claim.dateOfLoss)},
    {key:"coverage",label:"Coverage decision recorded",ok:!["pending","unknown",""].includes(claim.coverageStatus||"pending")},
    {key:"reserve",label:"Reserve reviewed",ok:Number.isFinite(Number(claim.reserveAmount))&&Number(claim.reserveAmount)>=0},
    {key:"investigation",label:"Special investigation resolved or not required",ok:!["referred","investigating","open"].includes(claim.siuStatus)},
    {key:"payment",label:"No pending claim payments",ok:!claimPayments.some(p=>["pending","awaiting_approval"].includes(p.status))}
  ];
  return {ready:checks.every(x=>x.ok),checks,missing:checks.filter(x=>!x.ok).map(x=>x.label)};
}
export function mutualWorkflowSummary({quotes=[],policies=[],claims=[],claimPayments=[]}={}){
  const reviewPolicies=policies.filter(p=>!["cancelled","expired"].includes(p.status)).map(policy=>({
    id:policy.id,label:policy.policyNumber||policy.customerName||"Policy",
    ...policyReadiness({policy,quote:quotes.find(q=>q.id===policy.quoteId)||{}})
  }));
  const reviewClaims=claims.filter(c=>!["closed","denied"].includes(c.status)).map(claim=>({
    id:claim.id,label:claim.claimNumber||claim.customerName||"Claim",
    ...claimReadiness({claim,payments:claimPayments})
  }));
  return {reviewPolicies,reviewClaims,
    policyExceptions:reviewPolicies.filter(x=>!x.ready).length,
    claimExceptions:reviewClaims.filter(x=>!x.ready).length};
}
