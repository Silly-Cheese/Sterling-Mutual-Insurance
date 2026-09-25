export const PERMISSIONS={
  CUSTOMER_READ:"customer.read",
  CUSTOMER_CREATE:"customer.create",
  CUSTOMER_UPDATE:"customer.update",
  STAFF_READ:"staff.read",
  STAFF_MANAGE:"staff.manage",
  AUDIT_READ:"audit.read",
  QUOTE_CREATE:"quote.create",
  QUOTE_UPDATE:"quote.update",
  QUOTE_SUBMIT:"quote.submit",
  POLICY_READ:"policy.read",
  CLAIM_CREATE_FOR_CUSTOMER:"claim.createForCustomer"
};

export const ROLE_PRESETS={
  founder:{label:"Founder / Chief Executive Officer",department:"Executive Office",permissions:["*"]},
  agent:{label:"Insurance Agent",department:"Sales",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.CUSTOMER_CREATE,PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.QUOTE_CREATE,PERMISSIONS.QUOTE_UPDATE,PERMISSIONS.QUOTE_SUBMIT,
    PERMISSIONS.POLICY_READ,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER
  ]},
  adjuster:{label:"Claims Adjuster",department:"Claims",permissions:[
    PERMISSIONS.CUSTOMER_READ,PERMISSIONS.POLICY_READ,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER
  ]}
};

export function can(staff,permission){
  if(!staff||staff.status!=="active") return false;
  return staff.permissions?.includes("*")||staff.permissions?.includes(permission);
}
