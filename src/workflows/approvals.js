import {collection,doc,getDocs,query,runTransaction,serverTimestamp,where} from "firebase/firestore";

const TYPES = new Set(["finance_review","deal_approval","service_authorization","policy_review","claim_settlement","billing_adjustment","manual_review"]);
const validText=(value,label)=>{if(typeof value!=="string"||!value.trim())throw new Error(label+" is required.");return value.trim()};
const validDate=value=>{if(!value)return null;const d=new Date(value);if(Number.isNaN(d.getTime()))throw new Error("Invalid due date.");return d.toISOString()};
const states=new Set(["pending","approved","rejected","cancelled"]);
export function proposedApproval({kind,recordId,customerId="",summary,requestedBy,amountCents=0,requiredPermission="approval.manage",dueAt=null}){
  if(!TYPES.has(kind))throw new Error("Unsupported approval type.");
  if(!Number.isSafeInteger(amountCents)||amountCents<0)throw new Error("Invalid integer-cent amount.");
  return {kind,recordId:validText(recordId,"Record"),customerId,summary:validText(summary,"Summary"),
    requestedBy:validText(requestedBy,"Requester"),amountCents,
    requiredPermission:validText(requiredPermission,"Approval permission"),dueAt:validDate(dueAt)};
}
/** Creates a review request and one linked task atomically. Caller must supply a stable operation id. */
export async function requestApproval(db,{id,...details}){
  const input=proposedApproval(details);
  const key=validText(id,"Operation ID");
  if(key.includes("/"))throw new Error("Invalid operation ID.");
  const approval=doc(db,"workflowApprovals",key),task=doc(db,"workflowTasks",key);
  return runTransaction(db,async tx=>{
    const [a,t]=await Promise.all([tx.get(approval),tx.get(task)]);
    if(a.exists()||t.exists()){
      if(a.exists()&&t.exists()&&a.data().recordId===input.recordId&&a.data().kind===input.kind&&a.data().requestedBy===input.requestedBy)return {id:key,duplicate:true};
      throw new Error("Operation ID already used.");
    }
    tx.set(approval,{...input,status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(task,{approvalId:key,recordId:input.recordId,customerId:input.customerId,
      title:input.summary,category:input.kind,status:"open",assignedPermission:input.requiredPermission,
      dueAt:input.dueAt,createdBy:input.requestedBy,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    return {id:key,duplicate:false};
  });
}
/** Only review decisions; does NOT settle a claim, approve financing or change business documents. */
export async function resolveApproval(db,{id,actorUid,decision,reason}){
  validText(actorUid,"Reviewer");validText(reason,"Decision reason");
  if(!["approved","rejected"].includes(decision))throw new Error("Invalid decision.");
  const approval=doc(db,"workflowApprovals",validText(id,"Approval ID"));
  const task=doc(db,"workflowTasks",id);
  return runTransaction(db,async tx=>{
    const [a,t]=await Promise.all([tx.get(approval),tx.get(task)]);
    if(!a.exists()||!t.exists())throw new Error("Approval record not found.");
    const record=a.data();
    if(record.status!=="pending")throw new Error("Approval has already been resolved.");
    if(record.requestedBy===actorUid)throw new Error("Requesters may not approve their own request.");
    tx.update(approval,{status:decision,resolvedBy:actorUid,reason:reason.trim(),resolvedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.update(task,{status:"completed",completionResult:decision,completedBy:actorUid,completedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    return {id,status:decision};
  });
}
export function taskPriority(task,now=new Date()){
  if(task.status==="completed"||task.status==="cancelled")return "closed";
  const due=task.dueAt && new Date(task.dueAt);
  if(due&&!Number.isNaN(due.getTime())&&due<now)return "overdue";
  if(due&&!Number.isNaN(due.getTime())&&due.getTime()-now.getTime()<86400000)return "due_soon";
  return "normal";
}
export function summarizeTasks(tasks,now=new Date()){
  return tasks.reduce((sum,t)=>{const p=taskPriority(t,now);sum[p]=(sum[p]||0)+1;return sum},{normal:0,overdue:0,due_soon:0,closed:0});
}
/** Explicit user-triggered reads; queries avoid composite indexes. */
export async function loadWorkflowQueue(db){
  const [tasks,approvals]=await Promise.all([
    getDocs(collection(db,"workflowTasks")),
    getDocs(collection(db,"workflowApprovals"))
  ]);
  return {tasks:tasks.docs.map(d=>({id:d.id,...d.data()})),
    approvals:approvals.docs.map(d=>({id:d.id,...d.data()}))};
}
