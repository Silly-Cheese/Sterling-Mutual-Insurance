import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,ClipboardCheck,ClipboardPlus,DollarSign,FileSearch,FileWarning,MessageSquare,Search,ShieldAlert,UserCheck,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const empty={policyId:"",lossDate:"",lossType:"collision",description:"",claimedAmount:"0",reportedBy:"customer",reportMethod:"phone",priority:"normal",severity:"moderate"};
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));
const claimNo=()=> "CLM-"+Date.now().toString().slice(-9);

export default function Claims({staff,initialCustomerId,openNew}){
  const [claims,setClaims]=useState([]),[policies,setPolicies]=useState([]),[staffList,setStaffList]=useState([]),[payments,setPayments]=useState([]),[contacts,setContacts]=useState([]),[estimates,setEstimates]=useState([]),[events,setEvents]=useState([]),[parties,setParties]=useState([]),[coverages,setCoverages]=useState([]),[recoveries,setRecoveries]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(empty),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false);

  async function safe(n){try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}}
  async function load(){
    const [c,p,s,pay,con,est,ev,par,cov,rec]=await Promise.all(["claims","policies","staff","claimPayments","claimContacts","claimEstimates","claimEvents","claimParties","claimCoverages","claimRecoveries"].map(safe));
    setClaims(c.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setPolicies(p.filter(p=>["active","renewal_pending","cancellation_pending"].includes(p.status)));
    setStaffList(s.filter(x=>x.status==="active"));setPayments(pay);setContacts(con);setEstimates(est);setEvents(ev.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setParties(par);setCoverages(cov);setRecoveries(rec);
    if(selected){const fresh=c.find(x=>x.id===selected.id);if(fresh)setSelected(fresh)}
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId&&policies.length){const p=policies.find(x=>x.customerId===initialCustomerId);setForm(v=>({...v,policyId:p?.id||""}));setOpen(true)}else if(openNew)setOpen(true)},[initialCustomerId,openNew,policies]);

  const policyMap=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,p])),[policies]);
  async function addEvent(claimId,type,summary,details={}){await addDoc(collection(db,"claimEvents"),{claimId,type,summary,details,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()})}

  async function createClaim(e){
    e.preventDefault();setSaving(true);
    try{
      const policy=policyMap[form.policyId];
      const ref=await addDoc(collection(db,"claims"),{
        claimNumber:claimNo(),policyId:form.policyId,policyNumber:policy?.policyNumber||"",customerId:policy?.customerId||"",customerName:policy?.customerName||"",
        lossDate:form.lossDate,lossType:form.lossType,description:form.description,claimedAmount:Number(form.claimedAmount||0),reportedBy:form.reportedBy,reportMethod:form.reportMethod,priority:form.priority,severity:form.severity,
        status:"open",stage:"intake",coverageStatus:"pending",liabilityStatus:"undetermined",reserveCategories:{property:0,bodilyInjury:0,rental:0,legal:0,other:0},reserveAmount:0,settlementAmount:0,siuStatus:"none",assignedTo:"",assignedName:"",
        createdBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      await addEvent(ref.id,"claim.created","Claim filed",{method:form.reportMethod});
      if(form.severity==="catastrophic"&&!can(staff,PERMISSIONS.APPROVAL_MANAGE))await addDoc(collection(db,"approvals"),{actionType:"catastrophic_claim_review",title:"Catastrophic claim review",summary:(policy?.customerName||"Customer")+" • catastrophic severity claim",recordId:ref.id,customerId:policy?.customerId||"",status:"pending",requestedBy:staff.id,requestedByName:staff.displayName,createdAt:serverTimestamp()});
      setOpen(false);setForm(empty);await load();
    }finally{setSaving(false)}
  }

  async function patchClaim(claim,patch,eventType,summary){await updateDoc(doc(db,"claims",claim.id),{...patch,updatedAt:serverTimestamp()});if(eventType)await addEvent(claim.id,eventType,summary,patch);setSelected({...claim,...patch});await load()}

  async function assignClaim(claim,uid){
    const assignee=staffList.find(s=>s.id===uid);
    await patchClaim(claim,{assignedTo:uid,assignedName:assignee?.displayName||""},"claim.assigned",uid?"Assigned to "+assignee?.displayName:"Claim unassigned");
  }

  async function referSIU(claim){
    const siuRef=await addDoc(collection(db,"siuCases"),{claimId:claim.id,claimNumber:claim.claimNumber,policyId:claim.policyId,policyNumber:claim.policyNumber,customerId:claim.customerId,customerName:claim.customerName,status:"open",stage:"triage",priority:claim.severity==="catastrophic"||claim.priority==="high"?"high":"normal",riskScore:50,referralType:"claim_concern",referralReason:"Manual referral from Claims",claimSeverity:claim.severity||"moderate",claimedAmount:Number(claim.claimedAmount||0),coverageStatusAtReferral:claim.coverageStatus,assignedTo:"",assignedName:"",openedBy:staff.id,openedByName:staff.displayName,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await patchClaim(claim,{siuStatus:"referred",siuCaseId:siuRef.id,stage:"investigation"},"siu.referred","Claim referred to Special Investigations");
  }

  return <section className="content">
    <div className="workflow-ribbon service-ribbon"><span>FNOL</span><span>Coverage</span><span>Investigation</span><span>Evaluation</span><span>Payment</span><span>Resolution</span><strong>Close</strong></div>
    <div className="page-heading"><div><div className="eyebrow">CLAIMS OPERATIONS</div><h1>Claims</h1><p>Case management from first notice through investigation, financial evaluation, payment, and closure.</p></div>{can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER)&&<button className="primary compact" onClick={()=>setOpen(true)}><ClipboardPlus size={17}/> File claim</button>}</div>

    <div className="metric-grid"><article className="metric-card"><div className="metric-icon"><ShieldAlert size={19}/></div><div className="metric-value">{claims.filter(c=>!["closed","denied"].includes(c.status)).length}</div><div className="metric-label">Open claims</div></article><article className="metric-card"><div className="metric-icon"><FileWarning size={19}/></div><div className="metric-value">{money(claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0))}</div><div className="metric-label">Outstanding reserves</div></article><article className="metric-card"><div className="metric-icon"><UserCheck size={19}/></div><div className="metric-value">{claims.filter(c=>c.assignedTo===staff.id).length}</div><div className="metric-label">Assigned to me</div></article><article className="metric-card"><div className="metric-icon"><DollarSign size={19}/></div><div className="metric-value">{money(payments.reduce((s,p)=>s+Number(p.amount||0),0))}</div><div className="metric-label">Paid to date</div></article></div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Claims inventory</strong><span>{claims.length} claims</span></div>{claims.length===0?<div className="empty-state"><ShieldAlert size={30}/><h3>No claims have been filed.</h3></div>:<div className="quote-list">{claims.map(c=><button className={"policy-row claim-row "+(c.priority==="high"?"claim-priority":"")} key={c.id} onClick={()=>setSelected(c)}><div className="product-icon"><ShieldAlert size={18}/></div><div className="quote-main"><strong>{c.customerName}</strong><span>{c.claimNumber} • {c.policyNumber} • {c.assignedName||"Unassigned"}</span></div><div className="quote-money"><strong>{money(c.claimedAmount)}</strong><span>{(c.stage||"intake").replaceAll("_"," ")} • Reserve {money(c.reserveAmount)}</span></div><span className={"status-pill "+c.status}>{c.status.replaceAll("_"," ")}</span></button>)}</div>}</div>

    {open&&<div className="modal-backdrop"><form className="modal wide" onSubmit={createClaim}><div className="modal-head"><div><div className="eyebrow">FIRST NOTICE OF LOSS</div><h2>File claim</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><div className="two-col"><label>Policy<select value={form.policyId} onChange={e=>setForm({...form,policyId:e.target.value})} required><option value="">Select policy</option>{policies.map(p=><option key={p.id} value={p.id}>{p.customerName} — {p.policyNumber}</option>)}</select></label><label>Loss date<input type="date" value={form.lossDate} onChange={e=>setForm({...form,lossDate:e.target.value})} required/></label></div><div className="three-col"><label>Loss type<select value={form.lossType} onChange={e=>setForm({...form,lossType:e.target.value})}><option value="collision">Collision</option><option value="theft">Theft</option><option value="weather">Weather</option><option value="property_damage">Property damage</option><option value="liability">Liability</option><option value="other">Other</option></select></label><label>Claimed amount<input type="number" min="0" value={form.claimedAmount} onChange={e=>setForm({...form,claimedAmount:e.target.value})}/></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="high">High</option></select></label><label>Severity<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="catastrophic">Catastrophic</option></select></label></div><label>Loss description<textarea rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Filing…":"File claim"}</button></div></form></div>}

    {selected&&<ClaimDetail claim={selected} staff={staff} staffList={staffList} payments={payments.filter(p=>p.claimId===selected.id)} contacts={contacts.filter(x=>x.claimId===selected.id)} estimates={estimates.filter(x=>x.claimId===selected.id)} events={events.filter(x=>x.claimId===selected.id)} parties={parties.filter(x=>x.claimId===selected.id)} coverages={coverages.filter(x=>x.claimId===selected.id)} recoveries={recoveries.filter(x=>x.claimId===selected.id)} addEvent={addEvent} onClose={()=>setSelected(null)} patchClaim={patchClaim} assignClaim={assignClaim} referSIU={referSIU} reload={load}/>}
  </section>
}

function ClaimDetail({claim,staff,staffList,payments,contacts,estimates,events,parties,coverages,recoveries,addEvent,onClose,patchClaim,assignClaim,referSIU,reload}){
  const [tab,setTab]=useState("summary");
  const [reserves,setReserves]=useState(claim.reserveCategories||{property:0,bodilyInjury:0,rental:0,legal:0,other:0});
  const [settlement,setSettlement]=useState(String(claim.settlementAmount||0));
  const [payment,setPayment]=useState({payee:"",category:"indemnity",amount:"",note:""});
  const [contact,setContact]=useState({party:"insured",method:"phone",outcome:"reached",summary:""});
  const [estimate,setEstimate]=useState({category:"repair",vendor:"",amount:"",status:"received"});
  const [liability,setLiability]=useState({status:claim.liabilityStatus||"undetermined",insuredPercent:String(claim.insuredLiabilityPercent??""),reason:claim.liabilityReason||""});
  const [party,setParty]=useState({type:"claimant",name:"",phone:"",email:"",notes:""});
  const [coverage,setCoverage]=useState({name:"Collision",status:"pending",limit:"",deductible:"",reason:""});
  const [reopenReason,setReopenReason]=useState("");
  const [recovery,setRecovery]=useState({type:"subrogation",party:"",amount:"",status:"potential",notes:""});
  const totalReserve=Object.values(reserves).reduce((s,v)=>s+Number(v||0),0);
  const paid=payments.filter(p=>p.status!=="voided"&&p.status!=="reversed").reduce((s,p)=>s+Number(p.amount||0),0);
  const totalEstimates=estimates.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalRecovered=recoveries.filter(r=>r.status==="recovered").reduce((s,r)=>s+Number(r.amount||0),0);

  async function saveReserves(){await patchClaim(claim,{reserveCategories:reserves,reserveAmount:totalReserve,stage:"evaluation"},"reserve.updated","Claim reserves updated")}
  async function addPayment(){
    if(!payment.payee||!Number(payment.amount))return;
    await addDoc(collection(db,"claimPayments"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,payee:payment.payee,category:payment.category,amount:Number(payment.amount),note:payment.note,status:"issued",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"claim.payment.issued",summary:"Payment issued to "+payment.payee,details:{amount:Number(payment.amount),category:payment.category},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"claims",claim.id),{stage:"payment",updatedAt:serverTimestamp()});setPayment({payee:"",category:"indemnity",amount:"",note:""});await reload();
  }
  async function addContact(){
    if(!contact.summary.trim())return;
    await addDoc(collection(db,"claimContacts"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,...contact,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"contact.logged",summary:"Contact logged: "+contact.party+" via "+contact.method,details:contact,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    setContact({party:"insured",method:"phone",outcome:"reached",summary:""});await reload();
  }
  async function addEstimate(){
    if(!estimate.vendor||!Number(estimate.amount))return;
    await addDoc(collection(db,"claimEstimates"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,...estimate,amount:Number(estimate.amount),createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"estimate.added",summary:"Estimate received from "+estimate.vendor,details:{amount:Number(estimate.amount),category:estimate.category},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    setEstimate({category:"repair",vendor:"",amount:"",status:"received"});await reload();
  }
  async function saveLiability(){
    await patchClaim(claim,{liabilityStatus:liability.status,insuredLiabilityPercent:liability.insuredPercent===""?null:Number(liability.insuredPercent),liabilityReason:liability.reason,stage:"investigation"},"liability.updated","Liability assessment updated");
  }
  async function addParty(){
    if(!party.name.trim())return;
    await addDoc(collection(db,"claimParties"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,...party,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"party.added",summary:"Claim party added: "+party.name,details:{type:party.type},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    setParty({type:"claimant",name:"",phone:"",email:"",notes:""});await reload();
  }
  async function addCoverage(){
    if(!coverage.name.trim())return;
    await addDoc(collection(db,"claimCoverages"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,...coverage,limit:Number(coverage.limit||0),deductible:Number(coverage.deductible||0),createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"coverage.item.added",summary:"Coverage item added: "+coverage.name,details:{status:coverage.status},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    setCoverage({name:"Collision",status:"pending",limit:"",deductible:"",reason:""});await reload();
  }
  async function voidPayment(p){
    if(!window.confirm("Void this claim payment? The original payment will remain in history."))return;
    await updateDoc(doc(db,"claimPayments",p.id),{status:"voided",voidedAt:serverTimestamp(),voidedBy:staff.id});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"claim.payment.voided",summary:"Claim payment voided",details:{paymentId:p.id,amount:p.amount},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});await reload();
  }
  async function reopenClaim(){
    if(!reopenReason.trim())return;
    await patchClaim(claim,{status:"open",stage:"investigation",reopenedAt:serverTimestamp(),reopenedBy:staff.id,reopenReason:reopenReason.trim()},"claim.reopened","Claim reopened: "+reopenReason.trim());
    setReopenReason("");
  }
  async function addRecovery(){
    if(!recovery.party.trim()||!Number(recovery.amount))return;
    await addDoc(collection(db,"claimRecoveries"),{
      claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,
      ...recovery,amount:Number(recovery.amount),
      createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()
    });
    await addEvent(claim.id,"recovery.added","Claim recovery added",{type:recovery.type,party:recovery.party,amount:Number(recovery.amount),status:recovery.status});
    setRecovery({type:"subrogation",party:"",amount:"",status:"potential",notes:""});await reload();
  }

  async function updateRecovery(r,status){
    await updateDoc(doc(db,"claimRecoveries",r.id),{status,updatedAt:serverTimestamp(),updatedBy:staff.id});
    await addEvent(claim.id,"recovery."+status,"Recovery "+status.replaceAll("_"," "),{recoveryId:r.id,amount:r.amount});
    await reload();
  }

  async function settleClaim(){
    const amount=Number(settlement||0);
    if(amount>=10000&&!can(staff,PERMISSIONS.APPROVAL_MANAGE)){
      await addDoc(collection(db,"approvals"),{actionType:"claim_settlement",title:"Large claim settlement",summary:claim.claimNumber+" • "+money(amount)+" settlement",recordId:claim.id,customerId:claim.customerId,requestedAmount:amount,status:"pending",requestedBy:staff.id,requestedByName:staff.displayName,createdAt:serverTimestamp()});
      await patchClaim(claim,{status:"approval_pending",stage:"resolution",proposedSettlementAmount:amount},"settlement.approval.requested","Settlement sent for management approval");return;
    }
    await patchClaim(claim,{settlementAmount:amount,status:"settled",stage:"resolution",reserveAmount:0},"settlement.issued","Settlement issued");
  }
  async function closeClaim(){
    const coverageResolved=["approved","denied"].includes(claim.coverageStatus);
    const liabilityResolved=claim.lossType!=="liability"||["accepted","partial","denied","not_applicable"].includes(claim.liabilityStatus);
    const financialResolved=claim.coverageStatus==="denied"||claim.status==="settled"||Number(claim.claimedAmount||0)===0;
    const siuResolved=claim.siuStatus!=="referred";
    const coverageItemsResolved=coverages.every(x=>x.status!=="pending");
    const paymentsResolved=payments.every(p=>!["pending"].includes(p.status));
    if(!coverageResolved||!liabilityResolved||!financialResolved||!siuResolved||!coverageItemsResolved||!paymentsResolved){alert("This claim is not ready to close. Review the Closure tab for unresolved requirements.");return}
    await patchClaim(claim,{status:"closed",stage:"closed",closedAt:serverTimestamp(),closedBy:staff.id,reserveAmount:0},"claim.closed","Claim closed");
  }

    const investigationChecks=[
    ["Insured/claimant contact",contacts.length>0],
    ["Coverage analysis",coverages.length>0||["approved","denied"].includes(claim.coverageStatus)],
    ["Liability review",claim.lossType!=="liability"||claim.liabilityStatus!=="undetermined"],
    ["Estimate/evaluation",Number(claim.claimedAmount||0)===0||estimates.length>0],
    ["Financial reserve",claim.coverageStatus==="denied"||Number(claim.reserveAmount||0)>0||claim.status==="settled"],
    ["SIU resolved",claim.siuStatus!=="referred"||claim.status==="closed"]
  ];
  const investigationComplete=Math.round(investigationChecks.filter(([,ok])=>ok).length/investigationChecks.length*100);

  async function requestReserveApproval(){
    const normalizedCategories=Object.fromEntries(Object.entries(reserves).map(([key,value])=>[key,Number(value||0)]));
    await addDoc(collection(db,"approvals"),{
      actionType:"large_reserve",
      title:"Large claim reserve",
      summary:claim.claimNumber+" • "+money(totalReserve)+" proposed reserve",
      recordId:claim.id,
      customerId:claim.customerId,
      requestedAmount:totalReserve,
      requestedReserveCategories:normalizedCategories,
      status:"pending",
      requestedBy:staff.id,
      requestedByName:staff.displayName,
      createdAt:serverTimestamp()
    });
    await updateDoc(doc(db,"claims",claim.id),{
      reserveApprovalStatus:"pending",
      proposedReserveAmount:totalReserve,
      proposedReserveCategories:normalizedCategories,
      updatedAt:serverTimestamp()
    });
    await addEvent(claim.id,"reserve.approval.requested","Large reserve sent for supervisor approval",{amount:totalReserve,categories:normalizedCategories});
    await reload();
  }

  const closeChecks=[
    ["Coverage resolved",["approved","denied"].includes(claim.coverageStatus)],
    ["Liability resolved",claim.lossType!=="liability"||["accepted","partial","denied","not_applicable"].includes(claim.liabilityStatus)],
    ["Financial outcome resolved",claim.coverageStatus==="denied"||claim.status==="settled"||Number(claim.claimedAmount||0)===0],
    ["Reserve cleared",Number(claim.reserveAmount||0)===0||claim.status==="settled"],
    ["Coverage items resolved",coverages.every(x=>x.status!=="pending")],
    ["SIU resolved",claim.siuStatus!=="referred"],
    ["Payments resolved",payments.every(p=>p.status!=="pending")]
  ];

  return <div className="modal-backdrop"><div className="modal claim-detail"><div className="modal-head"><div><div className="eyebrow">CLAIM FILE</div><h2>{claim.claimNumber}</h2><p>{claim.customerName} • {claim.policyNumber}</p></div><button onClick={onClose}><X/></button></div>
    <div className="claim-summary"><div><span>Stage</span><strong>{(claim.stage||"intake").replaceAll("_"," ")}</strong></div><div><span>Severity</span><strong>{claim.severity||"moderate"}</strong></div><div><span>Coverage</span><strong>{claim.coverageStatus}</strong></div><div><span>Reserve</span><strong>{money(claim.reserveAmount)}</strong></div><div><span>Paid</span><strong>{money(paid)}</strong></div><div><span>Investigation</span><strong>{investigationComplete}%</strong></div></div>
    <div className="record-tabs">{[["summary","Summary"],["parties","Parties"],["contacts","Contacts"],["coverage","Coverage"],["investigation","Investigation"],["financials","Financials"],["recovery","Recovery"],["timeline","Timeline"],["closure","Closure"]].map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div>

    {tab==="summary"&&<div className="claim-summary-grid"><article className="panel"><div className="eyebrow">ASSIGNMENT</div><h3>{claim.assignedName||"Unassigned"}</h3>{can(staff,PERMISSIONS.CLAIM_ASSIGN)&&<select value={claim.assignedTo||""} onChange={e=>assignClaim(claim,e.target.value)}><option value="">Unassigned</option>{staffList.map(s=><option key={s.id} value={s.id}>{s.displayName} — {s.title}</option>)}</select>}</article><article className="panel"><div className="eyebrow">LOSS</div><h3>{claim.lossType?.replaceAll("_"," ")}</h3><p>{claim.description}</p></article><article className="panel"><div className="eyebrow">CASE STAGE</div><select value={claim.stage||"intake"} disabled={!can(staff,PERMISSIONS.CLAIM_UPDATE)} onChange={e=>patchClaim(claim,{stage:e.target.value},"stage.changed","Claim stage changed")}><option value="intake">Intake</option><option value="coverage">Coverage</option><option value="investigation">Investigation</option><option value="evaluation">Evaluation</option><option value="payment">Payment</option><option value="resolution">Resolution</option><option value="closed">Closed</option></select></article><article className="panel"><div className="eyebrow">SIU</div><h3>{claim.siuStatus}</h3>{claim.siuStatus!=="referred"&&can(staff,PERMISSIONS.SIU_REFER)&&<button className="secondary compact" onClick={()=>referSIU(claim)}><AlertTriangle size={14}/> Refer to SIU</button>}</article></div>}

    {tab==="parties"&&<div className="claim-two-col"><form className="panel" onSubmit={e=>{e.preventDefault();addParty()}}><div className="eyebrow">CLAIM PARTIES</div><h3>Add involved party</h3><label>Party type<select value={party.type} onChange={e=>setParty({...party,type:e.target.value})}><option value="insured">Insured</option><option value="claimant">Claimant</option><option value="driver">Driver</option><option value="passenger">Passenger</option><option value="witness">Witness</option><option value="attorney">Attorney</option><option value="repair_shop">Repair shop</option><option value="medical_provider">Medical provider</option><option value="property_owner">Property owner</option></select></label><label>Name<input value={party.name} onChange={e=>setParty({...party,name:e.target.value})}/></label><div className="two-col"><label>Phone<input value={party.phone} onChange={e=>setParty({...party,phone:e.target.value})}/></label><label>Email<input value={party.email} onChange={e=>setParty({...party,email:e.target.value})}/></label></div><label>Notes<textarea rows="3" value={party.notes} onChange={e=>setParty({...party,notes:e.target.value})}/></label><button className="primary">Add party</button></form><div className="table-card"><div className="table-toolbar"><strong>People & organizations</strong><span>{parties.length}</span></div><div className="claim-party-list">{parties.map(p=><div key={p.id}><UserCheck size={16}/><div><strong>{p.name}</strong><span>{p.type.replaceAll("_"," ")} • {p.phone||p.email||"No contact listed"}</span>{p.notes&&<small>{p.notes}</small>}</div></div>)}</div></div></div>}
    {tab==="contacts"&&<div className="claim-two-col"><form className="panel" onSubmit={e=>{e.preventDefault();addContact()}}><div className="eyebrow">CONTACT LOG</div><h3>Record contact attempt</h3><div className="two-col"><label>Party<select value={contact.party} onChange={e=>setContact({...contact,party:e.target.value})}><option value="insured">Insured</option><option value="claimant">Claimant</option><option value="witness">Witness</option><option value="repair_shop">Repair shop</option><option value="provider">Provider</option><option value="attorney">Attorney</option></select></label><label>Method<select value={contact.method} onChange={e=>setContact({...contact,method:e.target.value})}><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option><option value="letter">Letter</option></select></label></div><label>Outcome<select value={contact.outcome} onChange={e=>setContact({...contact,outcome:e.target.value})}><option value="reached">Reached</option><option value="left_message">Left message</option><option value="no_answer">No answer</option><option value="scheduled_callback">Callback scheduled</option></select></label><label>Summary<textarea rows="4" value={contact.summary} onChange={e=>setContact({...contact,summary:e.target.value})}/></label><button className="primary">Save contact</button></form><div className="table-card"><div className="table-toolbar"><strong>Contact history</strong><span>{contacts.length}</span></div><div className="claim-contact-list">{contacts.map(c=><div key={c.id}><MessageSquare size={16}/><div><strong>{c.party} • {c.method}</strong><span>{c.summary}</span><small>{c.outcome} • {c.createdByName}</small></div></div>)}</div></div></div>}

    {tab==="coverage"&&<div className="coverage-workspace"><div className="claim-two-col"><form className="panel" onSubmit={e=>{e.preventDefault();addCoverage()}}><div className="eyebrow">COVERAGE ANALYSIS</div><h3>Add coverage item</h3><label>Coverage<input value={coverage.name} onChange={e=>setCoverage({...coverage,name:e.target.value})}/></label><div className="three-col"><label>Status<select value={coverage.status} onChange={e=>setCoverage({...coverage,status:e.target.value})}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="denied">Denied</option><option value="not_applicable">Not applicable</option></select></label><label>Limit<input type="number" value={coverage.limit} onChange={e=>setCoverage({...coverage,limit:e.target.value})}/></label><label>Deductible<input type="number" value={coverage.deductible} onChange={e=>setCoverage({...coverage,deductible:e.target.value})}/></label></div><label>Reason / analysis<textarea rows="4" value={coverage.reason} onChange={e=>setCoverage({...coverage,reason:e.target.value})}/></label><button className="primary">Add coverage decision</button></form><div className="table-card"><div className="table-toolbar"><strong>Coverage items</strong><span>{coverages.length}</span></div><div className="coverage-item-list">{coverages.map(v=><div key={v.id}><ShieldAlert size={16}/><div><strong>{v.name}</strong><span>{v.status} • Limit {money(v.limit)} • Deductible {money(v.deductible)}</span><small>{v.reason||"No analysis recorded"}</small></div></div>)}</div></div></div><article className="panel coverage-finalize"><div><div className="eyebrow">OVERALL COVERAGE DECISION</div><h3>{["approved","denied"].includes(claim.coverageStatus)?"Coverage decision finalized":"Finalize claim coverage"}</h3><p>{["approved","denied"].includes(claim.coverageStatus)?"Overall claim coverage is "+claim.coverageStatus+".":"Individual coverage items do not close the claim-level coverage decision. Finalize the overall decision here before claim closure."}</p></div><div className="coverage-decision-actions"><span className={"status-pill "+claim.coverageStatus}>{claim.coverageStatus}</span>{can(staff,PERMISSIONS.CLAIM_DECIDE)&&claim.coverageStatus==="pending"&&<><button className="primary compact" onClick={()=>patchClaim(claim,{coverageStatus:"approved",status:"approved",stage:"investigation"},"coverage.approved","Overall claim coverage approved")}>Approve claim coverage</button><button className="secondary compact danger-soft" onClick={()=>patchClaim(claim,{coverageStatus:"denied",status:"denied",stage:"resolution"},"coverage.denied","Overall claim coverage denied")}>Deny claim coverage</button></>}</div></article></div>}
    {tab==="investigation"&&<div className="claim-two-col"><article className="panel"><div className="eyebrow">COVERAGE</div><h3>Coverage decision</h3>{can(staff,PERMISSIONS.CLAIM_DECIDE)&&<div className="action-stack"><button className="secondary" onClick={()=>patchClaim(claim,{coverageStatus:"approved",status:"approved",stage:"investigation"},"coverage.approved","Coverage approved")}>Approve</button><button className="secondary danger-soft" onClick={()=>patchClaim(claim,{coverageStatus:"denied",status:"denied",stage:"resolution"},"coverage.denied","Coverage denied")}>Deny</button></div>}</article><article className="panel"><div className="eyebrow">LIABILITY</div><h3>Liability assessment</h3><label>Status<select value={liability.status} onChange={e=>setLiability({...liability,status:e.target.value})}><option value="undetermined">Undetermined</option><option value="accepted">Insured liable</option><option value="partial">Comparative / partial</option><option value="denied">Insured not liable</option><option value="not_applicable">Not applicable</option></select></label>{liability.status==="partial"&&<label>Insured liability %<input type="number" min="0" max="100" value={liability.insuredPercent} onChange={e=>setLiability({...liability,insuredPercent:e.target.value})}/></label>}<label>Rationale<textarea rows="4" value={liability.reason} onChange={e=>setLiability({...liability,reason:e.target.value})}/></label><button className="secondary" onClick={saveLiability}>Save assessment</button></article><form className="panel" onSubmit={e=>{e.preventDefault();addEstimate()}}><div className="eyebrow">ESTIMATES</div><h3>Add estimate</h3><div className="two-col"><label>Category<select value={estimate.category} onChange={e=>setEstimate({...estimate,category:e.target.value})}><option value="repair">Repair</option><option value="medical">Medical</option><option value="property">Property</option><option value="legal">Legal</option><option value="other">Other</option></select></label><label>Amount<input type="number" min="0" value={estimate.amount} onChange={e=>setEstimate({...estimate,amount:e.target.value})}/></label></div><label>Vendor / source<input value={estimate.vendor} onChange={e=>setEstimate({...estimate,vendor:e.target.value})}/></label><button className="primary">Add estimate</button></form><article className="panel"><div className="eyebrow">ESTIMATE TOTAL</div><h2>{money(totalEstimates)}</h2><div className="estimate-list">{estimates.map(e=><div key={e.id}><span>{e.vendor} • {e.category}</span><strong>{money(e.amount)}</strong></div>)}</div></article></div>}

    {tab==="financials"&&<div className="claims-action-grid"><section><div className="eyebrow">RESERVES</div><h3>Reserve categories</h3>{Object.entries({property:"Property damage",bodilyInjury:"Bodily injury",rental:"Rental",legal:"Legal",other:"Other"}).map(([k,label])=><label key={k}>{label}<input type="number" min="0" value={reserves[k]||0} onChange={e=>setReserves({...reserves,[k]:e.target.value})}/></label>)}<strong>Total reserve: {money(totalReserve)}</strong>{claim.reserveApprovalStatus==="pending"?<div className="notice-box">Reserve approval pending for {money(claim.proposedReserveAmount||totalReserve)}.</div>:can(staff,PERMISSIONS.CLAIM_RESERVE)&&totalReserve>=25000&&!can(staff,PERMISSIONS.APPROVAL_MANAGE)?<button className="secondary" onClick={requestReserveApproval}>Request reserve approval</button>:can(staff,PERMISSIONS.CLAIM_RESERVE)&&<button className="secondary" onClick={saveReserves}>Update reserves</button>}</section><section><div className="eyebrow">PAYMENTS</div><h3>Issue claim payment</h3>{can(staff,PERMISSIONS.CLAIM_PAYMENT)&&<><label>Payee<input value={payment.payee} onChange={e=>setPayment({...payment,payee:e.target.value})}/></label><div className="two-col"><label>Category<select value={payment.category} onChange={e=>setPayment({...payment,category:e.target.value})}><option value="indemnity">Indemnity</option><option value="repair">Repair</option><option value="medical">Medical</option><option value="rental">Rental</option><option value="legal">Legal</option></select></label><label>Amount<input type="number" min="0" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/></label></div><button className="primary compact" onClick={addPayment}>Issue payment</button></>}<div className="payment-mini">{payments.map(p=><div key={p.id}><span>{p.payee} • {p.category} • {p.status}</span><strong>{money(p.amount)}</strong>{p.status==="issued"&&can(staff,PERMISSIONS.CLAIM_PAYMENT)&&<button className="link-button" onClick={()=>voidPayment(p)}>Void</button>}</div>)}</div></section><section><div className="eyebrow">SETTLEMENT</div><h3>Resolve claim</h3><input type="number" value={settlement} onChange={e=>setSettlement(e.target.value)}/>{can(staff,PERMISSIONS.CLAIM_SETTLE)&&<button className="primary" onClick={settleClaim}>{Number(settlement||0)>=10000&&!can(staff,PERMISSIONS.APPROVAL_MANAGE)?"Request settlement approval":"Settle claim"}</button>}</section><section><div className="eyebrow">FINANCIAL SNAPSHOT</div><h3>{money(paid)} paid</h3><p>{money(totalReserve)} reserved • {money(totalEstimates)} in estimates • {money(totalRecovered)} recovered</p><p>Net paid loss: {money(Math.max(0,paid-totalRecovered))}</p></section></div>}

    {tab==="recovery"&&<div className="claim-two-col"><div className="panel"><div className="eyebrow">SUBROGATION & RECOVERY</div><h3>Record recovery opportunity</h3><label>Type<select value={recovery.type} onChange={e=>setRecovery({...recovery,type:e.target.value})}><option value="subrogation">Subrogation</option><option value="salvage">Salvage</option><option value="deductible">Deductible recovery</option><option value="other">Other recovery</option></select></label><label>Responsible party / source<input value={recovery.party} onChange={e=>setRecovery({...recovery,party:e.target.value})}/></label><div className="two-col"><label>Amount<input type="number" min="0" value={recovery.amount} onChange={e=>setRecovery({...recovery,amount:e.target.value})}/></label><label>Status<select value={recovery.status} onChange={e=>setRecovery({...recovery,status:e.target.value})}><option value="potential">Potential</option><option value="pursuing">Pursuing</option><option value="recovered">Recovered</option><option value="closed_no_recovery">Closed — no recovery</option></select></label></div><label>Notes<textarea rows="4" value={recovery.notes} onChange={e=>setRecovery({...recovery,notes:e.target.value})}/></label>{can(staff,PERMISSIONS.CLAIM_RECOVERY)&&<button className="primary" onClick={addRecovery}>Add recovery</button>}</div><div className="table-card"><div className="table-toolbar"><strong>Recoveries</strong><span>{recoveries.length}</span></div><div className="recovery-list">{recoveries.map(r=><div key={r.id}><div><strong>{r.type.replaceAll("_"," ")} • {r.party}</strong><span>{r.notes||"No notes"}</span></div><div><strong>{money(r.amount)}</strong><span className={"status-pill "+r.status}>{r.status.replaceAll("_"," ")}</span></div>{can(staff,PERMISSIONS.CLAIM_RECOVERY)&&r.status!=="recovered"&&<button className="secondary compact" onClick={()=>updateRecovery(r,"recovered")}>Mark recovered</button>}</div>)}</div></div></div>}
    {tab==="timeline"&&<div className="timeline">{events.map(e=><div key={e.id}><span className="timeline-dot"></span><div><strong>{e.summary}</strong><p>{e.type}</p><small>{e.actorName||"System"} • {e.createdAt?.toDate?e.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div>}

    {tab==="closure"&&<div className="claim-close-panel"><div className="eyebrow">CLOSURE CHECK</div><h3>Is this file ready to close?</h3><div className="investigation-progress"><span>Investigation completeness</span><strong>{investigationComplete}%</strong><div><i style={{width:investigationComplete+"%"}}></i></div></div><div className="close-checks">{closeChecks.map(([label,ok])=><div className={ok?"ok":"missing"} key={label}><ClipboardCheck size={16}/><span>{label}</span><strong>{ok?"Ready":"Needs action"}</strong>{!ok&&label==="Coverage resolved"&&can(staff,PERMISSIONS.CLAIM_DECIDE)&&<button className="secondary compact" onClick={()=>setTab("coverage")}>Resolve coverage</button>}</div>)}</div>{can(staff,PERMISSIONS.CLAIM_CLOSE)&&claim.status!=="closed"&&<button className="primary" onClick={closeClaim}>Close claim file</button>}{claim.status==="closed"&&can(staff,PERMISSIONS.CLAIM_REOPEN)&&<div className="reopen-box"><label>Reason to reopen<input value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="Required reason"/></label><button className="secondary" onClick={reopenClaim}>Reopen claim</button></div>}</div>}
  </div></div>
}
