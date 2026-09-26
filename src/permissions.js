export const PERMISSIONS={
  CUSTOMER_READ:"customer.read",
  CUSTOMER_CREATE:"customer.create",
  CUSTOMER_UPDATE:"customer.update",
  CUSTOMER_ACCOUNT_MANAGE:"customer.account.manage",
  WALKIN_READ:"walkin.read",
  WALKIN_CREATE:"walkin.create",
  WALKIN_MANAGE:"walkin.manage",
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
  POLICY_DELETE:"policy.delete",
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
  SIU_MANAGE:"siu.manage",
  BILLING_READ:"billing.read",
  BILLING_MANAGE:"billing.manage",
  FINANCE_READ:"finance.read",
  FINANCE_MANAGE:"finance.manage",
  DOCUMENT_READ:"document.read",
  DOCUMENT_MANAGE:"document.manage",
  ADMIN_READ:"admin.read",
  ADMIN_MANAGE:"admin.manage"
};

export const ROLE_PRESETS={
  founder:{label:"Founder / Chief Executive Officer",department:"Executive Office",permissions:["*"]},
  agent:{label:"Insurance Agent",department:"Sales",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.CUSTOMER_CREATE,PERMISSIONS.CUSTOMER_UPDATE,PERMISSIONS.CUSTOMER_ACCOUNT_MANAGE,
    PERMISSIONS.WALKIN_READ,PERMISSIONS.WALKIN_CREATE,PERMISSIONS.WALKIN_MANAGE,
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
  ]},
  billingSpecialist:{label:"Billing Specialist",department:"Billing",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.POLICY_READ,PERMISSIONS.BILLING_READ,PERMISSIONS.BILLING_MANAGE
  ]},
  financeManager:{label:"Finance Manager",department:"Finance",permissions:[
    PERMISSIONS.BILLING_READ,PERMISSIONS.FINANCE_READ,PERMISSIONS.FINANCE_MANAGE,PERMISSIONS.CLAIM_READ,PERMISSIONS.POLICY_READ
  ]},
  administrator:{label:"System Administrator",department:"Administration",permissions:[
    PERMISSIONS.STAFF_READ,PERMISSIONS.STAFF_MANAGE,PERMISSIONS.AUDIT_READ,PERMISSIONS.ADMIN_READ,PERMISSIONS.ADMIN_MANAGE,
    PERMISSIONS.CUSTOMER_ACCOUNT_MANAGE,PERMISSIONS.POLICY_DELETE,
    PERMISSIONS.WALKIN_READ,PERMISSIONS.WALKIN_CREATE,PERMISSIONS.WALKIN_MANAGE
  ]}
};

export function can(staff,permission){
  if(!staff||staff.status!=="active") return false;
  return staff.permissions?.includes("*")||staff.permissions?.includes(permission);
}
