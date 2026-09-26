import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,ClipboardPlus,DollarSign,FileWarning,Search,ShieldAlert,UserCheck,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const empty={policyId:"",lossDate:"",lossType:"collision",description:"",claimedAmount:"0",reportedBy:"customer",reportMethod:"phone",priority:"normal"};
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));
const claimNo=()=> "CLM-"+Date.now().toString().slice(-9);

export default function Claims({staff,initialCustomerId,openNew}){
  const [claims,setClaims]=useState([]),[policies,setPolicies]=useState([]),[staffList,setStaffList]=useState([]),[payments,setPayments]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(empty),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false);

  async function load(){
    const [c,p,s,pay]=await Promise.all([getDocs(collection(db,"claims")),getDocs(collection(db,"policies")),getDocs(collection(db,"staff")).catch(()=>({docs:[]})),getDocs(collection(db,"claimPayments")).catch(()=>({docs:[]}))]);
    setClaims(c.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})).filter(p=>["active","renewal_pending"].includes(p.status)));
    setStaffList(s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==="active"));
    setPayments(pay.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId&&policies.length){const p=policies.find(x=>x.customerId===initialCustomerId);setForm(v=>({...v,policyId:p?.id||""}));setOpen(true)}else if(openNew)setOpen(true)},[initialCustomerId,openNew,policies]);

  const policyMap=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,p])),[policies]);
  async function addEvent(claimId,type,summary,details={}){await addDoc(collection(db,"claimEvents"),{claimId,type,summary,details,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()})}

  async function createClaim(e){
    e.preventDefault();setSaving(true);
    try{
      const policy=policyMap[form.policyId];
      const ref=await addDoc(collection(db,"claims"),{claimNumber:claimNo(),policyId:form.policyId,policyNumber:policy?.policyNumber||"",customerId:policy?.customerId||"",customerName:policy?.customerName||"",lossDate:form.lossDate,lossType:form.lossType,description:form.description,claimedAmount:Number(form.claimedAmount||0),reportedBy:form.reportedBy,reportMethod:form.reportMethod,priority:form.priority,status:"open",coverageStatus:"pending",reserveCategories:{property:0,bodilyInjury:0,rental:0,legal:0,other:0},reserveAmount:0,settlementAmount:0,siuStatus:"none",assignedTo:"",assignedName:"",createdBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await addEvent(ref.id,"claim.created","Claim filed for customer",{method:form.reportMethod});setOpen(false);setForm(empty);await load();
    }finally{setSaving(false)}
  }

  async function patchClaim(claim,patch,eventType,summary){await updateDoc(doc(db,"claims",claim.id),{...patch,updatedAt:serverTimestamp()});if(eventType)await addEvent(claim.id,eventType,summary,patch);setSelected({...claim,...patch});await load()}

  async function assignClaim(claim,uid){
    const assignee=staffList.find(s=>s.id===uid);
    await patchClaim(claim,{assignedTo:uid,assignedName:assignee?.displayName||""},"claim.assigned",uid?"Claim assigned to "+assignee?.displayName:"Claim unassigned");
  }

  async function referSIU(claim){
    await addDoc(collection(db,"siuCases"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,customerName:claim.customerName,status:"open",riskScore:50,indicators:["Manual referral"],openedBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await patchClaim(claim,{siuStatus:"referred"},"siu.referred","Claim referred to Special Investigations");
  }

  return <section className="content">
    <div className="workflow-ribbon service-ribbon"><span>Intake</span><span>Customer</span><span>Policy</span><strong>Claim</strong><span>Decision</span><span>Settlement</span></div>
    <div className="page-heading"><div><div className="eyebrow">CLAIMS OPERATIONS</div><h1>Claims</h1><p>Assignment, reserves, payments, coverage decisions, settlements, and investigations.</p></div>{can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER)&&<button className="primary compact" onClick={()=>setOpen(true)}><ClipboardPlus size={17}/> File claim</button>}</div>

    <div className="metric-grid"><article className="metric-card"><div className="metric-icon"><ShieldAlert size={19}/></div><div className="metric-value">{claims.filter(c=>!["closed","denied"].includes(c.status)).length}</div><div className="metric-label">Open claims</div></article><article className="metric-card"><div className="metric-icon"><FileWarning size={19}/></div><div className="metric-value">{money(claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0))}</div><div className="metric-label">Outstanding reserves</div></article><article className="metric-card"><div className="metric-icon"><UserCheck size={19}/></div><div className="metric-value">{claims.filter(c=>c.assignedTo===staff.id).length}</div><div className="metric-label">Assigned to me</div></article><article className="metric-card"><div className="metric-icon"><DollarSign size={19}/></div><div className="metric-value">{money(payments.reduce((s,p)=>s+Number(p.amount||0),0))}</div><div className="metric-label">Claim payments</div></article></div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Claims inventory</strong><span>{claims.length} claims</span></div>{claims.length===0?<div className="empty-state"><ShieldAlert size={30}/><h3>No claims have been filed.</h3></div>:<div className="quote-list">{claims.map(c=><button className={"policy-row claim-row "+(c.priority==="high"?"claim-priority":"")} key={c.id} onClick={()=>setSelected(c)}><div className="product-icon"><ShieldAlert size={18}/></div><div className="quote-main"><strong>{c.customerName}</strong><span>{c.claimNumber} • {c.policyNumber} • {c.assignedName||"Unassigned"}</span></div><div className="quote-money"><strong>{money(c.claimedAmount)}</strong><span>Reserve {money(c.reserveAmount)}</span></div><span className={"status-pill "+c.status}>{c.status}</span></button>)}</div>}</div>

    {open&&<div className="modal-backdrop"><form className="modal wide" onSubmit={createClaim}><div className="modal-head"><div><div className="eyebrow">FIRST NOTICE OF LOSS</div><h2>File claim</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><div className="two-col"><label>Active policy<select value={form.policyId} onChange={e=>setForm({...form,policyId:e.target.value})} required><option value="">Select policy</option>{policies.map(p=><option key={p.id} value={p.id}>{p.customerName} — {p.policyNumber}</option>)}</select></label><label>Loss date<input type="date" value={form.lossDate} onChange={e=>setForm({...form,lossDate:e.target.value})} required/></label></div><div className="three-col"><label>Loss type<select value={form.lossType} onChange={e=>setForm({...form,lossType:e.target.value})}><option value="collision">Collision</option><option value="theft">Theft</option><option value="weather">Weather</option><option value="property_damage">Property damage</option><option value="liability">Liability</option><option value="other">Other</option></select></label><label>Claimed amount<input type="number" min="0" value={form.claimedAmount} onChange={e=>setForm({...form,claimedAmount:e.target.value})}/></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="high">High priority</option></select></label></div><label>Loss description<textarea rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Filing…":"File claim"}</button></div></form></div>}

    {selected&&<ClaimDetail claim={selected} staff={staff} staffList={staffList} payments={payments.filter(p=>p.claimId===selected.id)} onClose={()=>setSelected(null)} patchClaim={patchClaim} assignClaim={assignClaim} referSIU={referSIU} reload={load}/>}
  </section>
}

function ClaimDetail({claim,staff,staffList,payments,onClose,patchClaim,assignClaim,referSIU,reload}){
  const [reserves,setReserves]=useState(claim.reserveCategories||{property:0,bodilyInjury:0,rental:0,legal:0,other:0});
  const [settlement,setSettlement]=useState(String(claim.settlementAmount||0));
  const [payment,setPayment]=useState({payee:"",category:"indemnity",amount:"",note:""});
  const totalReserve=Object.values(reserves).reduce((s,v)=>s+Number(v||0),0);

  async function saveReserves(){await patchClaim(claim,{reserveCategories:reserves,reserveAmount:totalReserve},"reserve.updated","Claim reserves updated")}
  async function addPayment(){
    if(!payment.payee||!Number(payment.amount))return;
    await addDoc(collection(db,"claimPayments"),{claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,payee:payment.payee,category:payment.category,amount:Number(payment.amount),note:payment.note,status:"issued",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"claimEvents"),{claimId:claim.id,type:"claim.payment.issued",summary:"Claim payment issued to "+payment.payee,details:{amount:Number(payment.amount),category:payment.category},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    setPayment({payee:"",category:"indemnity",amount:"",note:""});await reload();
  }

  return <div className="modal-backdrop"><div className="modal claim-detail"><div className="modal-head"><div><div className="eyebrow">CLAIM FILE</div><h2>{claim.claimNumber}</h2></div><button onClick={onClose}><X/></button></div>
    <div className="claim-summary"><div><span>Insured</span><strong>{claim.customerName}</strong></div><div><span>Policy</span><strong>{claim.policyNumber}</strong></div><div><span>Claimed</span><strong>{money(claim.claimedAmount)}</strong></div><div><span>Coverage</span><strong>{claim.coverageStatus}</strong></div></div>
    {can(staff,PERMISSIONS.CLAIM_ASSIGN)&&<label>Assigned adjuster<select value={claim.assignedTo||""} onChange={e=>assignClaim(claim,e.target.value)}><option value="">Unassigned</option>{staffList.map(s=><option key={s.id} value={s.id}>{s.displayName} — {s.title}</option>)}</select></label>}
    <div className="claim-description"><span>Loss description</span><p>{claim.description}</p></div>
    <div className="claims-action-grid">
      <section><div className="eyebrow">RESERVES</div><h3>Reserve categories</h3>{Object.entries({property:"Property damage",bodilyInjury:"Bodily injury",rental:"Rental / temporary",legal:"Legal",other:"Other"}).map(([k,label])=><label key={k}>{label}<input type="number" min="0" value={reserves[k]||0} onChange={e=>setReserves({...reserves,[k]:e.target.value})}/></label>)}<strong>Total: {money(totalReserve)}</strong>{can(staff,PERMISSIONS.CLAIM_RESERVE)&&<button className="secondary" onClick={saveReserves}>Update reserves</button>}</section>
      <section><div className="eyebrow">COVERAGE</div><h3>Coverage decision</h3>{can(staff,PERMISSIONS.CLAIM_DECIDE)&&<div className="action-stack"><button className="secondary" onClick={()=>patchClaim(claim,{coverageStatus:"approved",status:"approved"},"coverage.approved","Coverage approved")}>Approve coverage</button><button className="secondary danger-soft" onClick={()=>patchClaim(claim,{coverageStatus:"denied",status:"denied"},"coverage.denied","Coverage denied")}>Deny coverage</button></div>}</section>
      <section><div className="eyebrow">CLAIM PAYMENTS</div><h3>Issue payment</h3>{can(staff,PERMISSIONS.CLAIM_PAYMENT)&&<><label>Payee<input value={payment.payee} onChange={e=>setPayment({...payment,payee:e.target.value})}/></label><div className="two-col"><label>Category<select value={payment.category} onChange={e=>setPayment({...payment,category:e.target.value})}><option value="indemnity">Indemnity</option><option value="repair">Repair</option><option value="medical">Medical</option><option value="rental">Rental</option><option value="legal">Legal</option></select></label><label>Amount<input type="number" min="0" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/></label></div><button className="primary compact" onClick={addPayment}>Issue payment</button></>}<div className="payment-mini">{payments.map(p=><div key={p.id}><span>{p.payee} • {p.category}</span><strong>{money(p.amount)}</strong></div>)}</div></section>
      <section><div className="eyebrow">SETTLEMENT / SIU</div><h3>Resolution</h3><label>Settlement amount<input type="number" value={settlement} onChange={e=>setSettlement(e.target.value)}/></label>{can(staff,PERMISSIONS.CLAIM_SETTLE)&&<button className="primary" onClick={()=>patchClaim(claim,{settlementAmount:Number(settlement),status:"settled",reserveAmount:0},"settlement.issued","Settlement issued")}>Settle claim</button>}{claim.siuStatus!=="referred"&&can(staff,PERMISSIONS.SIU_REFER)&&<button className="secondary" onClick={()=>referSIU(claim)}><AlertTriangle size={15}/> Refer to SIU</button>}</section>
    </div>
    <div className="modal-actions">{can(staff,PERMISSIONS.CLAIM_CLOSE)&&!["closed","denied"].includes(claim.status)&&<button className="secondary" onClick={()=>patchClaim(claim,{status:"closed"},"claim.closed","Claim closed")}>Close claim</button>}<button className="secondary" onClick={onClose}>Done</button></div>
  </div></div>
}
