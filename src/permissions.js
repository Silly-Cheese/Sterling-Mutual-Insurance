export const PERMISSIONS={
  CUSTOMER_READ:"customer.read",
  CUSTOMER_CREATE:"customer.create",
  CUSTOMER_UPDATE:"customer.update",
  STAFF_READ:"staff.read",
  STAFF_MANAGE:"staff.manage",
  AUDIT_READ:"audit.read",
  QUOTE_READ:"quote.read",
  QUOTE_CREATE:"quote.create",
  QUOTE_UPDATE:"quote.update",
  QUOTE_SUBMIT:"quote.submit",
  UNDERWRITING_REVIEW:"underwriting.review",
  POLICY_READ:"policy.read",
  POLICY_ISSUE:"policy.issue",
  POLICY_UPDATE:"policy.update",
  ASSET_MANAGE:"asset.manage",
  CLAIM_READ:"claim.read",
  CLAIM_CREATE_FOR_CUSTOMER:"claim.createForCustomer",
  CLAIM_UPDATE:"claim.update",
  CLAIM_ASSIGN:"claim.assign",
  CLAIM_RESERVE:"claim.reserve",
  CLAIM_DECIDE:"claim.decide",
  CLAIM_SETTLE:"claim.settle",
  CLAIM_CLOSE:"claim.close",
  EVIDENCE_MANAGE:"claim.evidence",
  SIU_READ:"siu.read",
  SIU_REFER:"siu.refer",
  SIU_MANAGE:"siu.manage"
};

export const ROLE_PRESETS={
  founder:{label:"Founder / Chief Executive Officer",department:"Executive Office",permissions:["*"]},
  agent:{label:"Insurance Agent",department:"Sales",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.CUSTOMER_CREATE,PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.QUOTE_READ,PERMISSIONS.QUOTE_CREATE,PERMISSIONS.QUOTE_UPDATE,PERMISSIONS.QUOTE_SUBMIT,
    PERMISSIONS.POLICY_READ,PERMISSIONS.ASSET_MANAGE,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER
  ]},
  underwriter:{label:"Underwriter",department:"Underwriting",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.QUOTE_READ,PERMISSIONS.UNDERWRITING_REVIEW,
    PERMISSIONS.POLICY_READ,PERMISSIONS.POLICY_ISSUE,PERMISSIONS.POLICY_UPDATE
  ]},
  adjuster:{label:"Claims Adjuster",department:"Claims",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.POLICY_READ,PERMISSIONS.CLAIM_READ,
    PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER,PERMISSIONS.CLAIM_UPDATE,PERMISSIONS.CLAIM_RESERVE,
    PERMISSIONS.CLAIM_DECIDE,PERMISSIONS.EVIDENCE_MANAGE,PERMISSIONS.SIU_REFER
  ]},
  claimsManager:{label:"Claims Manager",department:"Claims",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.POLICY_READ,PERMISSIONS.CLAIM_READ,
    PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER,PERMISSIONS.CLAIM_UPDATE,PERMISSIONS.CLAIM_ASSIGN,
    PERMISSIONS.CLAIM_RESERVE,PERMISSIONS.CLAIM_DECIDE,PERMISSIONS.CLAIM_SETTLE,
    PERMISSIONS.CLAIM_CLOSE,PERMISSIONS.EVIDENCE_MANAGE,PERMISSIONS.SIU_READ,PERMISSIONS.SIU_REFER
  ]},
  siuInvestigator:{label:"SIU Investigator",department:"Special Investigations",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.POLICY_READ,PERMISSIONS.CLAIM_READ,
    PERMISSIONS.SIU_READ,PERMISSIONS.SIU_MANAGE,PERMISSIONS.EVIDENCE_MANAGE
  ]}
};

export function can(staff,permission){
  if(!staff||staff.status!=="active") return false;
  return staff.permissions?.includes("*")||staff.permissions?.includes(permission);
}
