import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,setDoc,updateDoc} from "firebase/firestore";
import {Activity,Archive,BarChart3,Building2,CheckCircle2,FileText,KeyRound,Landmark,ShieldCheck,Users,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS,PERMISSION_GROUPS,ROLE_PRESETS,effectivePermissions} from "../permissions";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));

export default function Company({staff,onNavigate}){
  const [policies,setPolicies]=useState([]),[claims,setClaims]=useState([]),[tx,setTx]=useState([]),[staffList,setStaffList]=useState([]),[accounts,setAccounts]=useState([]),[audit,setAudit]=useState([]),[approvals,setApprovals]=useState([]),[archives,setArchives]=useState([]),[invoices,setInvoices]=useState([]),[cancellations,setCancellations]=useState([]),[siuCases,setSiuCases]=useState([]),[holds,setHolds]=useState([]),[documentRequests,setDocumentRequests]=useState([]),[tab,setTab]=useState("finance");

  async function safeDocs(name){
    try{const snap=await getDocs(collection(db,name));return snap.docs.map(d=>({id:d.id,...d.data()}))}catch{return []}
  }

  async function load(){
    const [p,c,t,s,ac,a,ap,ar,inv,can,siu,h,dr]=await Promise.all([
      safeDocs("policies"),safeDocs("claims"),safeDocs("billingTransactions"),safeDocs("staff"),safeDocs("accounts"),safeDocs("auditLogs"),safeDocs("approvals"),safeDocs("archives"),safeDocs("billingInvoices"),safeDocs("policyCancellations"),safeDocs("siuCases"),safeDocs("customerHolds"),safeDocs("documentRequests")
    ]);
    setPolicies(p);setClaims(c);setTx(t);setStaffList(s);setAccounts(ac);setApprovals(ap);setArchives(ar);setInvoices(inv);setCancellations(can);setSiuCases(siu);setHolds(h);setDocumentRequests(dr);
    setAudit(a.sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));
  }
  useEffect(()=>{load().catch(()=>{})},[]);

  const metrics=useMemo(()=>{
    const written=policies.reduce((s,p)=>s+Number(p.termPremium||0),0);
    const collected=tx.filter(t=>t.type==="payment").reduce((s,t)=>s+Number(t.amount||0),0);
    const refunds=tx.filter(t=>t.type==="refund").reduce((s,t)=>s+Number(t.amount||0),0);
    const paidClaims=claims.reduce((s,c)=>s+Number(c.settlementAmount||0),0);
    const reserves=claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0);
    const earned=Math.max(0,collected-refunds);
    const available=earned-paidClaims-reserves;
    const lossRatio=earned>0?(paidClaims/earned)*100:0;
    return {written,collected,refunds,paidClaims,reserves,earned,available,lossRatio};
  },[policies,claims,tx]);

  async function logAdmin(summary,details={}){
    try{await addDoc(collection(db,"auditLogs"),{eventType:"admin.manual",summary,details,actorUid:staff.id,actorDisplayName:staff.displayName,createdAt:serverTimestamp()})}catch{}
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">ENTERPRISE OPERATIONS</div><h1>Company</h1><p>Leadership, approvals, staff access, financial condition, archives, and audit oversight.</p></div></div>

    <div className="company-tabs">
      <button className={tab==="finance"?"active":""} onClick={()=>setTab("finance")}><Landmark size={15}/> Finance</button>
      <button className={tab==="analytics"?"active":""} onClick={()=>setTab("analytics")}><BarChart3 size={15}/> Analytics</button><button className={tab==="exceptions"?"active":""} onClick={()=>setTab("exceptions")}><ShieldCheck size={15}/> Exception Center</button>
      <button className={tab==="staff"?"active":""} onClick={()=>setTab("staff")}><Users size={15}/> Staff</button>
      {can(staff,PERMISSIONS.APPROVAL_READ)&&<button className={tab==="approvals"?"active":""} onClick={()=>setTab("approvals")}><CheckCircle2 size={15}/> Approvals</button>}
      {can(staff,PERMISSIONS.ARCHIVE_READ)&&<button className={tab==="archives"?"active":""} onClick={()=>setTab("archives")}><Archive size={15}/> Archive</button>}
      <button className={tab==="audit"?"active":""} onClick={()=>setTab("audit")}><Activity size={15}/> Audit Center</button>
      <button className={tab==="documents"?"active":""} onClick={()=>setTab("documents")}><FileText size={15}/> Documents</button>
    </div>

    {tab==="finance"&&<Finance metrics={metrics}/>}
    {tab==="analytics"&&<Analytics policies={policies} claims={claims} tx={tx} staffList={staffList}/>}    {tab==="exceptions"&&<Exceptions invoices={invoices} cancellations={cancellations} siuCases={siuCases} claims={claims} approvals={approvals} holds={holds} documentRequests={documentRequests} onNavigate={onNavigate}/>}
    {tab==="staff"&&<Staff staffList={staffList} accounts={accounts} canManage={can(staff,PERMISSIONS.ADMIN_MANAGE)||can(staff,PERMISSIONS.STAFF_MANAGE)} canPermissions={can(staff,PERMISSIONS.STAFF_PERMISSION_MANAGE)} logAdmin={logAdmin} reload={load} currentStaff={staff}/>}
    {tab==="approvals"&&<Approvals approvals={approvals} staff={staff} reload={load} logAdmin={logAdmin} onNavigate={onNavigate}/>}
    {tab==="archives"&&<Archives archives={archives}/>}
    {tab==="audit"&&<Audit audit={audit}/>}
    {tab==="documents"&&<Documents policies={policies}/>}
  </section>
}

function Finance({metrics}){
  return <div className="company-section">
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><Building2 size={19}/></div><div className="metric-value">{money(metrics.written)}</div><div className="metric-label">Written premium</div><div className="metric-sub">Current policy book</div></article>
      <article className="metric-card"><div className="metric-icon"><Landmark size={19}/></div><div className="metric-value">{money(metrics.earned)}</div><div className="metric-label">Net premium collected</div><div className="metric-sub">Payments less refunds</div></article>
      <article className="metric-card"><div className="metric-icon"><Activity size={19}/></div><div className="metric-value">{money(metrics.reserves)}</div><div className="metric-label">Claim reserves</div><div className="metric-sub">Outstanding exposure</div></article>
      <article className="metric-card"><div className="metric-icon"><BarChart3 size={19}/></div><div className="metric-value">{metrics.lossRatio.toFixed(1)}%</div><div className="metric-label">Paid loss ratio</div><div className="metric-sub">Settlements ÷ net premium</div></article>
    </div>
    <div className="finance-summary">
      <div><span>Premium collected</span><strong>{money(metrics.collected)}</strong></div>
      <div><span>Refunded premium</span><strong>{money(metrics.refunds)}</strong></div>
      <div><span>Claims paid</span><strong>{money(metrics.paidClaims)}</strong></div>
      <div><span>Outstanding reserves</span><strong>{money(metrics.reserves)}</strong></div>
      <div className="finance-total"><span>Available operating capital</span><strong>{money(metrics.available)}</strong></div>
    </div>
    <div className="notice-box">These are roleplay operating figures from Sterling Mutual's internal records, not statutory accounting.</div>
  </div>
}

function Analytics({policies,claims,tx,staffList}){
  const active=policies.filter(p=>p.status==="active").length;
  const cancelled=policies.filter(p=>p.status==="cancelled").length;
  const renewals=policies.filter(p=>p.status==="renewal_pending").length;
  const open=claims.filter(c=>!["closed","denied","settled"].includes(c.status)).length;
  const settled=claims.filter(c=>c.status==="settled").length;
  const payments=tx.filter(t=>t.type==="payment").length;
  const availableStaff=staffList.filter(s=>s.availability==="available").length;
  return <div className="company-section">
    <div className="analytics-grid">
      <article className="panel compact-panel"><div className="eyebrow">POLICIES</div><h2>{active}</h2><p>Active policies</p><div className="bar-track"><span style={{width:((active/(active+cancelled||1))*100)+"%"}}></span></div><small>{cancelled} cancelled • {renewals} renewal pending</small></article>
      <article className="panel compact-panel"><div className="eyebrow">CLAIMS</div><h2>{open}</h2><p>Open inventory</p><div className="bar-track"><span style={{width:((settled/(claims.length||1))*100)+"%"}}></span></div><small>{settled} settled claims</small></article>
      <article className="panel compact-panel"><div className="eyebrow">BILLING</div><h2>{payments}</h2><p>Posted payments</p><div className="bar-track"><span style={{width:Math.min(100,payments*10)+"%"}}></span></div><small>{tx.length} ledger entries</small></article>
      <article className="panel compact-panel"><div className="eyebrow">STAFF</div><h2>{availableStaff}</h2><p>Available now</p><div className="bar-track"><span style={{width:((availableStaff/(staffList.length||1))*100)+"%"}}></span></div><small>{staffList.length} total staff</small></article>
    </div>
  </div>
}

function Staff({staffList,accounts,canManage,canPermissions,logAdmin,reload,currentStaff}){
  const [pendingRoles,setPendingRoles]=useState({});
  const [permissionStaff,setPermissionStaff]=useState(null);
  const [custom,setCustom]=useState([]);
  const staffIds=new Set(staffList.map(s=>s.id));
  const pending=accounts.filter(a=>!staffIds.has(a.id));

  function nextEmployeeId(){
    const nums=staffList.map(s=>Number(String(s.employeeId||"").replace(/\D/g,""))).filter(Number.isFinite);
    return "SMI-"+String(Math.max(1,...nums)+1).padStart(6,"0");
  }

  async function activateAccount(account){
    const role=pendingRoles[account.id]||"agent";
    const preset=ROLE_PRESETS[role];
    if(!preset||role==="founder")return;
    await setDoc(doc(db,"staff",account.id),{
      employeeId:nextEmployeeId(),authUid:account.id,displayName:account.displayName||account.email||"Staff Member",email:account.email||"",
      role,title:preset.label,department:preset.department,customPermissions:[],permissions:preset.permissions,status:"active",availability:"offline",
      createdAt:serverTimestamp(),createdBy:currentStaff.id
    });
    await updateDoc(doc(db,"accounts",account.id),{accessStatus:"staff",assignedRole:role,assignedAt:serverTimestamp(),assignedBy:currentStaff.id});
    await logAdmin("Pending account activated",{accountId:account.id,role});await reload();
  }

  async function setRole(s,role){
    const preset=ROLE_PRESETS[role];if(!preset)return;
    const customs=s.customPermissions||[];
    await updateDoc(doc(db,"staff",s.id),{role,title:preset.label,department:preset.department,permissions:effectivePermissions(role,customs),updatedAt:serverTimestamp(),updatedBy:currentStaff.id});
    await logAdmin("Staff role updated",{staffId:s.id,role,customPermissions:customs});await reload();
  }

  async function setStatus(s,status){
    await updateDoc(doc(db,"staff",s.id),{status,updatedAt:serverTimestamp(),updatedBy:currentStaff.id});
    await logAdmin("Staff status updated",{staffId:s.id,status});await reload();
  }

  async function setAvailability(s,availability){
    await updateDoc(doc(db,"staff",s.id),{availability,availabilityUpdatedAt:serverTimestamp(),updatedBy:currentStaff.id});
    await logAdmin("Staff availability updated",{staffId:s.id,availability});await reload();
  }

  function editPermissions(s){setPermissionStaff(s);setCustom(s.customPermissions||[])}
  function togglePermission(permission){setCustom(v=>v.includes(permission)?v.filter(x=>x!==permission):[...v,permission])}
  async function savePermissions(){
    if(!permissionStaff)return;
    const permissions=effectivePermissions(permissionStaff.role,custom);
    await updateDoc(doc(db,"staff",permissionStaff.id),{customPermissions:custom,permissions,updatedAt:serverTimestamp(),updatedBy:currentStaff.id});
    await logAdmin("Individual staff permissions updated",{staffId:permissionStaff.id,customPermissions:custom});
    setPermissionStaff(null);await reload();
  }

  return <div className="company-section">
    <div className="table-card"><div className="table-toolbar"><strong>Pending accounts</strong><span>{pending.length} awaiting assignment</span></div>
      {pending.length===0?<div className="empty-state"><Users size={28}/><h3>No pending accounts.</h3><p>New registrations appear here until staff access is assigned.</p></div>:<div className="staff-list">{pending.map(a=><div className="staff-row staff-admin-row pending-account-row" key={a.id}><div className="avatar">{(a.displayName||a.email||"?").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase()}</div><div><strong>{a.displayName||"Unnamed account"}</strong><span>{a.email} • No staff access</span></div><select value={pendingRoles[a.id]||"agent"} disabled={!canManage} onChange={e=>setPendingRoles(v=>({...v,[a.id]:e.target.value}))}>{Object.entries(ROLE_PRESETS).filter(([key])=>key!=="founder").map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select><button className="primary compact" disabled={!canManage} onClick={()=>activateAccount(a)}>Assign staff access</button></div>)}</div>}
    </div>

    <div className="table-card"><div className="table-toolbar"><strong>Staff directory</strong><span>{staffList.length} employees</span></div>
      <div className="staff-list">{staffList.map(s=><div className="staff-row staff-admin-row expanded" key={s.id}>
        <div className="avatar">{s.displayName?.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
        <div><strong>{s.displayName}</strong><span>{s.employeeId||"No employee ID"} • {s.title||s.role}</span><small>{(s.customPermissions||[]).length} individual permission override(s)</small></div>
        <select value={s.role||""} disabled={!canManage||s.role==="founder"} onChange={e=>setRole(s,e.target.value)}>{Object.entries(ROLE_PRESETS).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select>
        <select value={s.availability||"offline"} disabled={!canManage&&s.id!==currentStaff.id} onChange={e=>setAvailability(s,e.target.value)}><option value="available">Available</option><option value="busy">Busy</option><option value="away">Away</option><option value="break">On break</option><option value="offline">Offline</option></select>
        <select value={s.status||"active"} disabled={!canManage||s.role==="founder"} onChange={e=>setStatus(s,e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="terminated">Terminated</option></select>
        {canPermissions&&s.role!=="founder"&&<button className="secondary compact" onClick={()=>editPermissions(s)}><KeyRound size={14}/> Permissions</button>}
      </div>)}</div>
    </div>
    <div className="notice-box">A role supplies the baseline capability set. Individual permissions can be added on top without creating a new role. Founder access remains protected.</div>

    {permissionStaff&&<div className="modal-backdrop"><div className="modal permission-modal"><div className="modal-head"><div><div className="eyebrow">INDIVIDUAL ACCESS</div><h2>{permissionStaff.displayName}</h2><p>Role: {ROLE_PRESETS[permissionStaff.role]?.label||permissionStaff.role}</p></div><button onClick={()=>setPermissionStaff(null)}><X/></button></div><div className="permission-groups">{Object.entries(PERMISSION_GROUPS).map(([group,permissions])=><section key={group}><strong>{group}</strong><div>{permissions.map(permission=>{const inherited=(ROLE_PRESETS[permissionStaff.role]?.permissions||[]).includes(permission);const checked=inherited||custom.includes(permission);return <label className={inherited?"permission inherited":"permission"} key={permission}><input type="checkbox" checked={checked} disabled={inherited} onChange={()=>togglePermission(permission)}/><span><b>{permission}</b><small>{inherited?"Included by role":"Individual override"}</small></span></label>})}</div></section>)}</div><div className="modal-actions"><button className="secondary" onClick={()=>setPermissionStaff(null)}>Cancel</button><button className="primary" onClick={savePermissions}>Save individual permissions</button></div></div></div>}
  </div>
}

function Approvals({approvals,staff,reload,logAdmin,onNavigate}){
  async function decide(a,status){
    if(status==="approved"){
      if(a.actionType==="claim_settlement"){
        await updateDoc(doc(db,"claims",a.recordId),{status:"settled",settlementAmount:Number(a.requestedAmount||0),reserveAmount:0,approvedSettlementBy:staff.id,updatedAt:serverTimestamp()});
        await addDoc(collection(db,"claimEvents"),{claimId:a.recordId,type:"settlement.approved",summary:"Management approved settlement",details:{amount:Number(a.requestedAmount||0)},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
      }
      if(a.actionType==="large_reserve"){
        await updateDoc(doc(db,"claims",a.recordId),{reserveAmount:Number(a.requestedAmount||0),reserveCategories:a.requestedReserveCategories||{},reserveApprovalStatus:"approved",proposedReserveAmount:null,proposedReserveCategories:null,reserveApprovedBy:staff.id,reserveApprovedAt:serverTimestamp(),stage:"evaluation",updatedAt:serverTimestamp()});
        await addDoc(collection(db,"claimEvents"),{claimId:a.recordId,type:"reserve.approved",summary:"Management approved claim reserve",details:{amount:Number(a.requestedAmount||0)},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
      }
      if(a.actionType==="siu_adverse_finding"){
        if(a.findingId)await updateDoc(doc(db,"siuFindings",a.findingId),{status:"final",supervisorApproved:true,supervisorApprovedBy:staff.id,supervisorApprovedAt:serverTimestamp()});
        if(a.recordId)await updateDoc(doc(db,"siuCases",a.recordId),{stage:"analysis",latestFindingId:a.findingId||null,supervisorReviewedAt:serverTimestamp(),supervisorReviewedBy:staff.id,updatedAt:serverTimestamp()});
      }
      if(a.actionType==="large_refund"){
        const policySnap=await getDocs(collection(db,"policies"));
        const policy=policySnap.docs.find(d=>d.id===a.recordId);
        const p=policy?{id:policy.id,...policy.data()}:null;
        if(p)await addDoc(collection(db,"billingTransactions"),{policyId:p.id,policyNumber:p.policyNumber,customerId:p.customerId,customerName:p.customerName,type:"refund",amount:Number(a.requestedAmount||0),note:"Management-approved refund",status:"posted",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
      }
    }
    if(status==="denied"&&a.actionType==="large_reserve"&&a.recordId)await updateDoc(doc(db,"claims",a.recordId),{reserveApprovalStatus:"denied",proposedReserveAmount:null,proposedReserveCategories:null,updatedAt:serverTimestamp()});
    await updateDoc(doc(db,"approvals",a.id),{status,decidedBy:staff.id,decidedByName:staff.displayName,decidedAt:serverTimestamp()});
    await logAdmin("Approval "+status,{approvalId:a.id,actionType:a.actionType});await reload();
  }
  const pending=approvals.filter(a=>a.status==="pending");
  return <div className="company-section"><div className="table-card"><div className="table-toolbar"><strong>Approval queue</strong><span>{pending.length} pending</span></div>{approvals.length===0?<div className="empty-state"><ShieldCheck size={28}/><h3>No approval requests.</h3></div>:<div className="approval-list">{approvals.map(a=><div key={a.id}><div><strong>{a.title||a.actionType}</strong><span>{a.summary||"Management approval requested"} • {a.requestedByName||"Staff"}</span></div><span className={"status-pill "+a.status}>{a.status}</span><div className="approval-actions">{a.actionType==="siu_adverse_finding"?<button className="secondary compact" onClick={()=>onNavigate?.("SIU")}>Open SIU</button>:a.actionType?.includes("claim")||a.actionType==="large_reserve"?<button className="secondary compact" onClick={()=>onNavigate?.("Claims",{customerId:a.customerId})}>Open claim</button>:a.actionType==="large_refund"?<button className="secondary compact" onClick={()=>onNavigate?.("Billing",{policyId:a.recordId})}>Open billing</button>:null}{a.status==="pending"&&can(staff,PERMISSIONS.APPROVAL_MANAGE)&&<><button className="secondary compact" onClick={()=>decide(a,"denied")}>Deny</button><button className="primary compact" onClick={()=>decide(a,"approved")}>Approve</button></>}</div></div>)}</div>}</div></div>
}

function Archives({archives,staff,reload,logAdmin}){
  async function restore(a){
    if(a.recordType==="policy"&&a.sourceId){
      await updateDoc(doc(db,"policies",a.sourceId),{status:a.snapshot?.status&&a.snapshot.status!=="archived"?a.snapshot.status:"cancelled",restoredAt:serverTimestamp(),restoredBy:staff.id,updatedAt:serverTimestamp()});
      await updateDoc(doc(db,"archives",a.id),{restored:true,restoredAt:serverTimestamp(),restoredBy:staff.id});
      await logAdmin("Archived policy restored",{archiveId:a.id,policyId:a.sourceId});
      await reload();
    }
  }
  return <div className="company-section"><div className="table-card"><div className="table-toolbar"><strong>Records Archive</strong><span>{archives.length} archived records</span></div>{archives.length===0?<div className="empty-state"><Archive size={28}/><h3>The archive is empty.</h3><p>Archived records and snapshots appear here.</p></div>:<div className="archive-list">{archives.map(a=><div key={a.id}><Archive size={16}/><div><strong>{a.title||a.recordType||"Archived record"}</strong><span>{a.recordType} • {a.restored?"Restored":a.reason||"Archived"}</span></div><div className="archive-actions"><code>{a.sourceId||a.id}</code>{!a.restored&&can(staff,PERMISSIONS.ARCHIVE_MANAGE)&&a.recordType==="policy"&&<button className="secondary compact" onClick={()=>restore(a)}>Restore</button>}</div></div>)}</div>}</div></div>
}

function Audit({audit}){
  return <div className="company-section"><div className="table-card"><div className="table-toolbar"><strong>Audit Center</strong><span>{audit.length} events</span></div>{audit.length===0?<div className="empty-state">No audit events available.</div>:<div className="audit-list">{audit.map(a=><div className="audit-row" key={a.id}><div className="audit-dot"></div><div><strong>{a.summary||a.eventType}</strong><span>{a.actorDisplayName||a.actorEmployeeId||"System"} • {a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():"Pending timestamp"}</span></div><code>{a.eventType}</code></div>)}</div>}</div></div>
}

function Documents({policies}){
  return <div className="company-section"><div className="documents-grid">{policies.slice(0,18).map(p=><article className="document-card" key={p.id}><FileText size={22}/><div><strong>Policy Declaration</strong><span>{p.policyNumber}</span></div><button className="secondary compact" onClick={()=>window.print()}>Print</button></article>)}</div>{policies.length===0&&<div className="empty-state"><FileText size={30}/><h3>No policy documents yet.</h3></div>}<div className="notice-box">Document Center is ready for declarations, insurance cards, cancellation notices, renewal notices, receipts, claim letters, and customer correspondence.</div></div>
}


function Exceptions({invoices,cancellations,siuCases,claims,approvals,holds,documentRequests,onNavigate}){
  const today=new Date().toISOString().slice(0,10);
  const ageDays=ts=>ts?.toDate?Math.max(0,Math.floor((Date.now()-ts.toDate().getTime())/86400000)):0;
  const daysUntil=date=>date?Math.ceil((new Date(date+"T23:59:59")-new Date())/86400000):null;
  const items=[
    ...holds.filter(h=>h.status==="active"&&h.severity==="critical").map(h=>({kind:"Customer hold",title:h.reason,detail:(h.createdByName||"Staff")+" • critical service hold",priority:1,page:"Customers"})),
    ...invoices.filter(i=>!["paid","void"].includes(i.status)&&i.dueDate<today).map(i=>({kind:"Billing",title:i.customerName||i.policyNumber,detail:(i.invoiceNumber||"Invoice")+" • overdue since "+i.dueDate,priority:ageDays(i.createdAt)>=10?1:2,page:"Billing",context:{policyId:i.policyId}})),
    ...cancellations.filter(c=>c.status==="open").map(c=>{const d=daysUntil(c.effectiveDate);return {kind:"Cancellation",title:c.customerName||c.policyNumber,detail:c.policyNumber+" • "+(d===null?"no effective date":d<0?Math.abs(d)+" days overdue":d+" days to effective"),priority:d!==null&&d<=5?1:2,page:"Cancellations"}}),
    ...siuCases.filter(s=>s.status==="open"&&(ageDays(s.createdAt)>=7||s.stage==="supervisor_review")).map(s=>({kind:"SIU",title:s.claimNumber,detail:s.stage==="supervisor_review"?"Supervisor review required":ageDays(s.createdAt)+" days open",priority:1,page:"SIU"})),
    ...claims.filter(cl=>!["closed","denied"].includes(cl.status)&&(cl.severity==="catastrophic"||Number(cl.reserveAmount||0)>=50000)).map(cl=>({kind:"Claims",title:cl.claimNumber,detail:(cl.severity||"claim")+" • reserve "+money(cl.reserveAmount),priority:1,page:"Claims",context:{customerId:cl.customerId}})),
    ...approvals.filter(a=>a.status==="pending").map(a=>({kind:"Approval",title:a.title||a.actionType,detail:a.summary||"Management approval required",priority:1,page:"Company"})),
    ...documentRequests.filter(r=>r.status==="requested"&&r.dueDate&&r.dueDate<today).map(r=>({kind:"Documents",title:r.customerName||"Customer document",detail:r.title+" • overdue since "+r.dueDate,priority:2,page:"Customers"}))
  ].sort((a,b)=>a.priority-b.priority);
  return <div className="company-section">
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-value">{items.length}</div><div className="metric-label">Open exceptions</div></article>
      <article className="metric-card"><div className="metric-value">{items.filter(x=>x.priority===1).length}</div><div className="metric-label">Priority exceptions</div></article>
      <article className="metric-card"><div className="metric-value">{cancellations.filter(c=>c.status==="open").length}</div><div className="metric-label">Open cancellations</div></article>
      <article className="metric-card"><div className="metric-value">{approvals.filter(a=>a.status==="pending").length}</div><div className="metric-label">Pending approvals</div></article>
    </div>
    <div className="table-card"><div className="table-toolbar"><strong>Enterprise exception queue</strong><span>{items.length} items</span></div>{items.length===0?<div className="empty-state"><CheckCircle2 size={28}/><h3>No enterprise exceptions.</h3><p>Nothing currently requires elevated attention.</p></div>:<div className="exception-list">{items.map((x,i)=><button key={i} className={x.priority===1?"priority":""} onClick={()=>onNavigate?.(x.page,x.context)}><span className="exception-kind">{x.kind}</span><div><strong>{x.title}</strong><small>{x.detail}</small></div><span>Open</span></button>)}</div>}</div>
  </div>
}
