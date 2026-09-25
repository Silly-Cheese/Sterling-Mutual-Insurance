import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,ClipboardPlus,FileWarning,Search,ShieldAlert,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const empty={policyId:"",lossDate:"",lossType:"collision",description:"",claimedAmount:"0",reportedBy:"customer",reportMethod:"phone"};
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));
const claimNo=()=>"CLM-"+Date.now().toString().slice(-9);

export default function Claims({staff}){
  const [claims,setClaims]=useState([]),[policies,setPolicies]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(empty),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false);

  async function load(){
    const [c,p]=await Promise.all([getDocs(collection(db,"claims")),getDocs(collection(db,"policies"))]);
    setClaims(c.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.status==="active"));
  }
  useEffect(()=>{load().catch(()=>{})},[]);

  const policyMap=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,p])),[policies]);

  async function addEvent(claimId,type,summary,details={}){
    await addDoc(collection(db,"claimEvents"),{claimId,type,summary,details,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
  }

  async function createClaim(e){
    e.preventDefault();setSaving(true);
    try{
      const policy=policyMap[form.policyId];
      const ref=await addDoc(collection(db,"claims"),{
        claimNumber:claimNo(),policyId:form.policyId,policyNumber:policy?.policyNumber||"",customerId:policy?.customerId||"",customerName:policy?.customerName||"",
        lossDate:form.lossDate,lossType:form.lossType,description:form.description,claimedAmount:Number(form.claimedAmount||0),
        reportedBy:form.reportedBy,reportMethod:form.reportMethod,status:"open",coverageStatus:"pending",reserveAmount:0,settlementAmount:0,siuStatus:"none",
        createdBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      await addEvent(ref.id,"claim.created","Claim filed for customer",{method:form.reportMethod});
      setOpen(false);setForm(empty);await load();
    }finally{setSaving(false)}
  }

  async function patchClaim(claim,patch,eventType,summary){
    await updateDoc(doc(db,"claims",claim.id),{...patch,updatedAt:serverTimestamp()});
    if(eventType)await addEvent(claim.id,eventType,summary,patch);
    setSelected({...claim,...patch});await load();
  }

  async function referSIU(claim){
    await addDoc(collection(db,"siuCases"),{
      claimId:claim.id,claimNumber:claim.claimNumber,customerId:claim.customerId,customerName:claim.customerName,status:"open",riskScore:50,indicators:["Manual referral"],openedBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    await patchClaim(claim,{siuStatus:"referred"},"siu.referred","Claim referred to Special Investigations");
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">CLAIMS OPERATIONS</div><h1>Claims</h1><p>File claims for customers, manage reserves, coverage decisions, settlements, and investigations.</p></div>{can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER)&&<button className="primary compact" onClick={()=>setOpen(true)}><ClipboardPlus size={17}/> File claim for customer</button>}</div>

    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><ShieldAlert size={19}/></div><div className="metric-value">{claims.filter(c=>!["closed","denied"].includes(c.status)).length}</div><div className="metric-label">Open claims</div><div className="metric-sub">Active inventory</div></article>
      <article className="metric-card"><div className="metric-icon"><FileWarning size={19}/></div><div className="metric-value">{money(claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0))}</div><div className="metric-label">Outstanding reserves</div><div className="metric-sub">Estimated claim exposure</div></article>
      <article className="metric-card"><div className="metric-icon"><AlertTriangle size={19}/></div><div className="metric-value">{claims.filter(c=>c.siuStatus==="referred").length}</div><div className="metric-label">SIU referrals</div><div className="metric-sub">Special investigation review</div></article>
      <article className="metric-card"><div className="metric-icon"><Search size={19}/></div><div className="metric-value">{claims.filter(c=>c.coverageStatus==="pending").length}</div><div className="metric-label">Coverage pending</div><div className="metric-sub">Decision required</div></article>
    </div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Claims inventory</strong><span>{claims.length} claims</span></div>
      {claims.length===0?<div className="empty-state"><ShieldAlert size={30}/><h3>No claims have been filed.</h3><p>Staff can file a claim on behalf of any customer with an active policy.</p></div>:
      <div className="quote-list">{claims.map(c=><button className="policy-row claim-row" key={c.id} onClick={()=>setSelected(c)}>
        <div className="product-icon"><ShieldAlert size={18}/></div>
        <div className="quote-main"><strong>{c.customerName}</strong><span>{c.claimNumber} • {c.policyNumber} • {c.lossType}</span></div>
        <div className="quote-money"><strong>{money(c.claimedAmount)}</strong><span>Reserve {money(c.reserveAmount)}</span></div>
        <span className={"status-pill "+c.status}>{c.status}</span>
      </button>)}</div>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal wide" onSubmit={createClaim}>
      <div className="modal-head"><div><div className="eyebrow">FIRST NOTICE OF LOSS</div><h2>File claim for customer</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div>
      <div className="two-col"><label>Active policy<select value={form.policyId} onChange={e=>setForm({...form,policyId:e.target.value})} required><option value="">Select policy</option>{policies.map(p=><option key={p.id} value={p.id}>{p.customerName} — {p.policyNumber}</option>)}</select></label><label>Loss date<input type="date" value={form.lossDate} onChange={e=>setForm({...form,lossDate:e.target.value})} required/></label></div>
      <div className="three-col"><label>Loss type<select value={form.lossType} onChange={e=>setForm({...form,lossType:e.target.value})}><option value="collision">Collision</option><option value="theft">Theft</option><option value="weather">Weather</option><option value="property_damage">Property damage</option><option value="liability">Liability</option><option value="other">Other</option></select></label><label>Claimed amount<input type="number" min="0" value={form.claimedAmount} onChange={e=>setForm({...form,claimedAmount:e.target.value})}/></label><label>Report method<select value={form.reportMethod} onChange={e=>setForm({...form,reportMethod:e.target.value})}><option value="phone">Phone</option><option value="in_person">In person</option><option value="online">Online</option><option value="email">Email</option></select></label></div>
      <label>Reported by<input value={form.reportedBy} onChange={e=>setForm({...form,reportedBy:e.target.value})}/></label>
      <label>Loss description<textarea rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Filing…":"File claim"}</button></div>
    </form></div>}

    {selected&&<ClaimDetail claim={selected} staff={staff} onClose={()=>setSelected(null)} patchClaim={patchClaim} referSIU={referSIU}/>}
  </section>
}

function ClaimDetail({claim,staff,onClose,patchClaim,referSIU}){
  const [reserve,setReserve]=useState(String(claim.reserveAmount||0)),[settlement,setSettlement]=useState(String(claim.settlementAmount||0));
  return <div className="modal-backdrop"><div className="modal claim-detail">
    <div className="modal-head"><div><div className="eyebrow">CLAIM FILE</div><h2>{claim.claimNumber}</h2></div><button onClick={onClose}><X/></button></div>
    <div className="claim-summary"><div><span>Insured</span><strong>{claim.customerName}</strong></div><div><span>Policy</span><strong>{claim.policyNumber}</strong></div><div><span>Claimed</span><strong>{money(claim.claimedAmount)}</strong></div><div><span>Coverage</span><strong>{claim.coverageStatus}</strong></div></div>
    <div className="claim-description"><span>Loss description</span><p>{claim.description}</p></div>
    <div className="claims-action-grid">
      <section><div className="eyebrow">RESERVE</div><h3>Claim reserve</h3><input type="number" value={reserve} onChange={e=>setReserve(e.target.value)}/>{can(staff,PERMISSIONS.CLAIM_RESERVE)&&<button className="secondary" onClick={()=>patchClaim(claim,{reserveAmount:Number(reserve)},"reserve.updated","Claim reserve updated")}>Update reserve</button>}</section>
      <section><div className="eyebrow">COVERAGE</div><h3>Coverage decision</h3><div className="action-stack">{can(staff,PERMISSIONS.CLAIM_DECIDE)&&<><button className="secondary" onClick={()=>patchClaim(claim,{coverageStatus:"approved",status:"approved"},"coverage.approved","Coverage approved")}>Approve coverage</button><button className="secondary danger-soft" onClick={()=>patchClaim(claim,{coverageStatus:"denied",status:"denied"},"coverage.denied","Coverage denied")}>Deny coverage</button></>}</div></section>
      <section><div className="eyebrow">SETTLEMENT</div><h3>Settlement</h3><input type="number" value={settlement} onChange={e=>setSettlement(e.target.value)}/>{can(staff,PERMISSIONS.CLAIM_SETTLE)&&<button className="primary" onClick={()=>patchClaim(claim,{settlementAmount:Number(settlement),status:"settled",reserveAmount:0},"settlement.issued","Settlement issued")}>Issue settlement</button>}</section>
      <section><div className="eyebrow">SPECIAL INVESTIGATIONS</div><h3>SIU</h3><p>{claim.siuStatus==="referred"?"This claim has been referred to SIU.":"Refer suspicious or complex claims for investigation."}</p>{claim.siuStatus!=="referred"&&can(staff,PERMISSIONS.SIU_REFER)&&<button className="secondary" onClick={()=>referSIU(claim)}><AlertTriangle size={15}/> Refer to SIU</button>}</section>
    </div>
    <div className="modal-actions">{can(staff,PERMISSIONS.CLAIM_CLOSE)&&!["closed","denied"].includes(claim.status)&&<button className="secondary" onClick={()=>patchClaim(claim,{status:"closed"},"claim.closed","Claim closed")}>Close claim</button>}<button className="secondary" onClick={onClose}>Done</button></div>
  </div></div>
}
