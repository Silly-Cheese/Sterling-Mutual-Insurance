import {useEffect,useMemo,useState} from "react";
import {collection,doc,getDocs,query,serverTimestamp,where,writeBatch,updateDoc} from "firebase/firestore";
import {Archive,ArrowRight,Car,CreditCard,FileCheck2,Home,Pencil,Plus,ShieldAlert,ShieldCheck,Trash2,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

function money(v){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0))}
function policyNo(){return "SMI-"+new Date().getFullYear()+"-"+Date.now().toString().slice(-7)}
function addMonths(date,months){const d=new Date(date);d.setMonth(d.getMonth()+months);return d.toISOString().slice(0,10)}

export default function Policies({staff,onNavigate,initialCustomerId}){
  const [policies,setPolicies]=useState([]),[quotes,setQuotes]=useState([]),[assets,setAssets]=useState([]),[issuing,setIssuing]=useState(null),[selected,setSelected]=useState(null),[editing,setEditing]=useState(false),[editForm,setEditForm]=useState(null),[deleteMessage,setDeleteMessage]=useState("");

  async function load(){
    const [p,q,a]=await Promise.all([getDocs(collection(db,"policies")),getDocs(collection(db,"quotes")),getDocs(collection(db,"insuredAssets"))]);
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));
    setQuotes(q.docs.map(d=>({id:d.id,...d.data()})));
    setAssets(a.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId&&policies.length){const match=policies.find(p=>p.customerId===initialCustomerId);if(match)setSelected(match)}},[initialCustomerId,policies]);

  const approved=quotes.filter(q=>q.status==="approved");
  const assetMap=useMemo(()=>Object.fromEntries(assets.map(a=>[a.policyId,a])),[assets]);

  async function issue(q){
    setIssuing(q.id);
    try{
      const batch=writeBatch(db);
      const policyRef=doc(collection(db,"policies"));
      const assetRef=doc(collection(db,"insuredAssets"));
      const today=new Date().toISOString().slice(0,10);
      const number=policyNo();
      batch.set(policyRef,{
        policyNumber:number,
        customerId:q.customerId,
        customerName:q.customerName,
        quoteId:q.id,
        product:q.product,
        status:"active",
        monthlyPremium:Number(q.monthlyPremium||0),
        termPremium:Number(q.sixMonthPremium||0),
        deductible:Number(q.deductible||0),
        liabilityLimit:Number(q.liabilityLimit||0),
        propertyDamageLimit:Number(q.propertyDamageLimit||0),
        effectiveDate:today,
        expirationDate:addMonths(today,6),
        issuedBy:staff.id,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
      batch.set(assetRef,{
        policyId:policyRef.id,
        customerId:q.customerId,
        type:q.assetType||"vehicle",
        description:q.assetDescription,
        status:"insured",
        createdAt:serverTimestamp()
      });
      batch.update(doc(db,"quotes",q.id),{status:"issued",policyId:policyRef.id,issuedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await batch.commit();
      await load();
    }finally{setIssuing(null)}
  }

  async function changeStatus(policy,status){
    await updateDoc(doc(db,"policies",policy.id),{status,updatedAt:serverTimestamp(),statusChangedBy:staff.id,statusChangedAt:serverTimestamp()});
    setSelected(null);await load();
  }

  function startEdit(policy){
    setEditForm({
      monthlyPremium:String(policy.monthlyPremium??""),
      termPremium:String(policy.termPremium??""),
      deductible:String(policy.deductible??""),
      liabilityLimit:String(policy.liabilityLimit??""),
      propertyDamageLimit:String(policy.propertyDamageLimit??""),
      effectiveDate:policy.effectiveDate||"",
      expirationDate:policy.expirationDate||"",
      status:policy.status||"active"
    });
    setEditing(true);
    setDeleteMessage("");
  }

  async function saveEdit(e){
    e.preventDefault();
    if(!selected||!editForm)return;
    const patch={
      monthlyPremium:Number(editForm.monthlyPremium||0),
      termPremium:Number(editForm.termPremium||0),
      deductible:Number(editForm.deductible||0),
      liabilityLimit:Number(editForm.liabilityLimit||0),
      propertyDamageLimit:Number(editForm.propertyDamageLimit||0),
      effectiveDate:editForm.effectiveDate,
      expirationDate:editForm.expirationDate,
      status:editForm.status,
      updatedAt:serverTimestamp(),
      updatedBy:staff.id
    };
    await updateDoc(doc(db,"policies",selected.id),patch);
    setSelected({...selected,...patch});
    setEditing(false);
    await load();
  }

  async function archivePolicy(policy){
    await updateDoc(doc(db,"policies",policy.id),{
      status:"archived",
      archivedAt:serverTimestamp(),
      archivedBy:staff.id,
      updatedAt:serverTimestamp()
    });
    setSelected(null);
    await load();
  }

  async function permanentlyDelete(policy){
    setDeleteMessage("");
    if(policy.status==="active"){
      setDeleteMessage("Active policies must be cancelled or archived before permanent deletion.");
      return;
    }
    const [claimsSnap,billingSnap,assetsSnap]=await Promise.all([
      getDocs(query(collection(db,"claims"),where("policyId","==",policy.id))),
      getDocs(query(collection(db,"billingTransactions"),where("policyId","==",policy.id))),
      getDocs(query(collection(db,"insuredAssets"),where("policyId","==",policy.id)))
    ]);
    if(!claimsSnap.empty||!billingSnap.empty){
      setDeleteMessage("This policy has claim or billing history and cannot be permanently deleted. Archive it instead.");
      return;
    }
    if(!window.confirm("Permanently delete "+policy.policyNumber+"? This cannot be undone."))return;
    const batch=writeBatch(db);
    assetsSnap.docs.forEach(d=>batch.delete(d.ref));
    batch.delete(doc(db,"policies",policy.id));
    await batch.commit();
    setSelected(null);
    await load();
  }

  return <section className="content">
    <div className="workflow-ribbon"><span>Intake</span><span>Customer</span><span>Quote</span><span>Underwriting</span><strong>Policy</strong><span>Service</span></div>
    <div className="page-heading"><div><div className="eyebrow">POLICY ADMINISTRATION</div><h1>Policies</h1><p>Issue approved applications and manage active Sterling Mutual coverage.</p></div></div>

    {approved.length>0&&can(staff,PERMISSIONS.POLICY_ISSUE)&&<div className="issuance-banner">
      <div><div className="eyebrow">READY TO BIND</div><h3>{approved.length} approved {approved.length===1?"application is":"applications are"} ready for policy issuance.</h3></div>
      <div className="issuance-stack">{approved.slice(0,3).map(q=><div key={q.id}><span>{q.customerName} • {q.product?.toUpperCase()}</span><button className="primary compact" disabled={issuing===q.id} onClick={()=>issue(q)}><Plus size={15}/>{issuing===q.id?"Issuing…":"Issue policy"}</button></div>)}</div>
    </div>}

    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><FileCheck2 size={19}/></div><div className="metric-value">{policies.filter(p=>p.status==="active").length}</div><div className="metric-label">Policies in force</div><div className="metric-sub">Active coverage</div></article>
      <article className="metric-card"><div className="metric-icon"><ShieldCheck size={19}/></div><div className="metric-value">{money(policies.filter(p=>p.status==="active").reduce((s,p)=>s+Number(p.termPremium||0),0))}</div><div className="metric-label">Written term premium</div><div className="metric-sub">Active book of business</div></article>
      <article className="metric-card"><div className="metric-icon"><Car size={19}/></div><div className="metric-value">{assets.filter(a=>a.type==="vehicle").length}</div><div className="metric-label">Insured vehicles</div><div className="metric-sub">Registered assets</div></article>
      <article className="metric-card"><div className="metric-icon"><Home size={19}/></div><div className="metric-value">{assets.filter(a=>a.type==="property").length}</div><div className="metric-label">Insured properties</div><div className="metric-sub">Registered assets</div></article>
    </div>

    <div className="table-card workflow-table">
      <div className="table-toolbar"><strong>Policy book</strong><span>{policies.length} policies</span></div>
      {policies.length===0?<div className="empty-state"><FileCheck2 size={30}/><h3>No policies have been issued.</h3><p>Approved applications will appear above when they are ready to bind.</p></div>:
      <div className="quote-list">{policies.map(p=>{const asset=assetMap[p.id];return <button className="policy-row" key={p.id} onClick={()=>setSelected(p)}>
        <div className="product-icon">{p.product==="home"?<Home size={18}/>:<Car size={18}/>}</div>
        <div className="quote-main"><strong>{p.customerName}</strong><span>{p.policyNumber} • {asset?.description||p.product?.toUpperCase()}</span></div>
        <div className="quote-money"><strong>{money(p.monthlyPremium)}/mo</strong><span>{p.effectiveDate} → {p.expirationDate}</span></div>
        <span className={"status-pill "+p.status}>{p.status}</span>
      </button>})}</div>}
    </div>

    {selected&&<div className="modal-backdrop"><div className="modal wide">
      <div className="modal-head"><div><div className="eyebrow">POLICY RECORD</div><h2>{selected.policyNumber}</h2></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="policy-hero"><div><span>Named insured</span><strong>{selected.customerName}</strong></div><div><span>Status</span><strong>{selected.status.toUpperCase()}</strong></div><div><span>Product</span><strong>{selected.product?.toUpperCase()}</strong></div></div>
      <div className="coverage-grid"><div><span>Monthly premium</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Term premium</span><strong>{money(selected.termPremium)}</strong></div><div><span>Deductible</span><strong>{money(selected.deductible)}</strong></div><div><span>Liability</span><strong>{money(selected.liabilityLimit)}</strong></div><div><span>Property damage</span><strong>{money(selected.propertyDamageLimit)}</strong></div><div><span>Insured asset</span><strong>{assetMap[selected.id]?.description||"Not listed"}</strong></div></div>
      {deleteMessage&&<div className="error-box">{deleteMessage}</div>}<div className="record-handoff"><span>Continue servicing this policy</span><div><button className="secondary compact" onClick={()=>onNavigate?.("Billing",{policyId:selected.id})}><CreditCard size={14}/> Billing</button><button className="secondary compact" onClick={()=>onNavigate?.("Claims",{customerId:selected.customerId})}><ShieldAlert size={14}/> File claim</button><button className="secondary compact" onClick={()=>onNavigate?.("Customers",{customerId:selected.customerId})}>Customer <ArrowRight size={14}/></button></div></div>
      <div className="modal-actions policy-admin-actions">
        {can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="secondary" onClick={()=>startEdit(selected)}><Pencil size={15}/> Edit policy</button>}
        {can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status!=="archived"&&<button className="secondary" onClick={()=>archivePolicy(selected)}><Archive size={15}/> Archive</button>}
        {can(staff,PERMISSIONS.POLICY_DELETE)&&<button className="secondary danger-soft" onClick={()=>permanentlyDelete(selected)}><Trash2 size={15}/> Delete permanently</button>}
        {can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status==="active"&&<button className="secondary danger-soft" onClick={()=>changeStatus(selected,"cancelled")}>Cancel policy</button>}
        {can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status==="cancelled"&&<button className="primary" onClick={()=>changeStatus(selected,"active")}>Reinstate policy</button>}
        <button className="secondary" onClick={()=>setSelected(null)}>Close</button>
      </div>
    </div></div>}{editing&&selected&&editForm&&<div className="modal-backdrop"><form className="modal wide" onSubmit={saveEdit}><div className="modal-head"><div><div className="eyebrow">POLICY ADMINISTRATION</div><h2>Edit {selected.policyNumber}</h2></div><button type="button" onClick={()=>setEditing(false)}><X/></button></div><div className="three-col"><label>Monthly premium<input type="number" min="0" step="0.01" value={editForm.monthlyPremium} onChange={e=>setEditForm({...editForm,monthlyPremium:e.target.value})}/></label><label>Term premium<input type="number" min="0" step="0.01" value={editForm.termPremium} onChange={e=>setEditForm({...editForm,termPremium:e.target.value})}/></label><label>Status<select value={editForm.status} onChange={e=>setEditForm({...editForm,status:e.target.value})}><option value="active">Active</option><option value="cancelled">Cancelled</option><option value="archived">Archived</option></select></label></div><div className="three-col"><label>Deductible<input type="number" min="0" value={editForm.deductible} onChange={e=>setEditForm({...editForm,deductible:e.target.value})}/></label><label>Liability limit<input type="number" min="0" value={editForm.liabilityLimit} onChange={e=>setEditForm({...editForm,liabilityLimit:e.target.value})}/></label><label>Property damage limit<input type="number" min="0" value={editForm.propertyDamageLimit} onChange={e=>setEditForm({...editForm,propertyDamageLimit:e.target.value})}/></label></div><div className="two-col"><label>Effective date<input type="date" value={editForm.effectiveDate} onChange={e=>setEditForm({...editForm,effectiveDate:e.target.value})}/></label><label>Expiration date<input type="date" value={editForm.expirationDate} onChange={e=>setEditForm({...editForm,expirationDate:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditing(false)}>Cancel</button><button className="primary">Save policy changes</button></div></form></div>}
  </section>
}
