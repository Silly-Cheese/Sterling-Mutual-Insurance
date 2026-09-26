import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,query,serverTimestamp,where,writeBatch,updateDoc} from "firebase/firestore";
import {Archive,ArrowRight,Car,CreditCard,FileCheck2,History,Home,Pencil,Plus,RefreshCw,ShieldAlert,ShieldCheck,Trash2,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));
const policyNo=()=> "SMI-"+new Date().getFullYear()+"-"+Date.now().toString().slice(-7);
function addMonths(date,months){const d=new Date(date);d.setMonth(d.getMonth()+months);return d.toISOString().slice(0,10)}
function snapshot(p){return {status:p.status,monthlyPremium:p.monthlyPremium,termPremium:p.termPremium,deductible:p.deductible,liabilityLimit:p.liabilityLimit,propertyDamageLimit:p.propertyDamageLimit,effectiveDate:p.effectiveDate,expirationDate:p.expirationDate}}

export default function Policies({staff,onNavigate,initialCustomerId}){
  const [policies,setPolicies]=useState([]),[quotes,setQuotes]=useState([]),[assets,setAssets]=useState([]),[versions,setVersions]=useState([]),[endorsements,setEndorsements]=useState([]),[selected,setSelected]=useState(null),[issuing,setIssuing]=useState(null),[editing,setEditing]=useState(false),[editForm,setEditForm]=useState(null),[mode,setMode]=useState("policy"),[deleteMessage,setDeleteMessage]=useState(""),[cancelForm,setCancelForm]=useState({date:"",reason:""}),[renewForm,setRenewForm]=useState({monthlyPremium:"",termPremium:""});

  async function load(){
    const [p,q,a,v,e]=await Promise.all(["policies","quotes","insuredAssets","policyVersions","endorsements"].map(async n=>{try{return await getDocs(collection(db,n))}catch{return {docs:[]}}}));
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));
    setQuotes(q.docs.map(d=>({id:d.id,...d.data()})));setAssets(a.docs.map(d=>({id:d.id,...d.data()})));setVersions(v.docs.map(d=>({id:d.id,...d.data()})));setEndorsements(e.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId&&policies.length){const match=policies.find(p=>p.customerId===initialCustomerId);if(match)setSelected(match)}},[initialCustomerId,policies]);

  const approved=quotes.filter(q=>q.status==="approved");
  const assetMap=useMemo(()=>Object.fromEntries(assets.map(a=>[a.policyId,a])),[assets]);

  async function issue(q){
    setIssuing(q.id);
    try{
      const batch=writeBatch(db);const policyRef=doc(collection(db,"policies"));const assetRef=doc(collection(db,"insuredAssets"));const versionRef=doc(collection(db,"policyVersions"));const declarationRef=doc(collection(db,"documents"));const cardRef=doc(collection(db,"documents"));const today=new Date().toISOString().slice(0,10);const number=policyNo();
      const policy={policyNumber:number,customerId:q.customerId,customerName:q.customerName,quoteId:q.id,product:q.product,status:"active",version:1,monthlyPremium:Number(q.monthlyPremium||0),termPremium:Number(q.sixMonthPremium||0),deductible:Number(q.deductible||0),liabilityLimit:Number(q.liabilityLimit||0),propertyDamageLimit:Number(q.propertyDamageLimit||0),effectiveDate:today,expirationDate:addMonths(today,6),issuedBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      batch.set(policyRef,policy);batch.set(assetRef,{policyId:policyRef.id,customerId:q.customerId,type:q.assetType||"vehicle",description:q.assetDescription,status:"insured",createdAt:serverTimestamp()});
      batch.set(versionRef,{policyId:policyRef.id,policyNumber:number,version:1,reason:"Policy issued",snapshot:snapshot(policy),createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
      batch.set(declarationRef,{customerId:q.customerId,policyId:policyRef.id,policyNumber:number,type:"policy_declaration",title:"Policy Declaration",status:"available",createdAt:serverTimestamp(),createdBy:staff.id});
      batch.set(cardRef,{customerId:q.customerId,policyId:policyRef.id,policyNumber:number,type:"proof_of_insurance",title:"Proof of Insurance",status:"available",createdAt:serverTimestamp(),createdBy:staff.id});
      batch.update(doc(db,"quotes",q.id),{status:"issued",policyId:policyRef.id,issuedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      batch.update(doc(db,"customers",q.customerId),{status:"active_customer",updatedAt:serverTimestamp(),updatedBy:staff.id});
      await batch.commit();await load();
    }finally{setIssuing(null)}
  }

  function startEdit(p){setEditForm({monthlyPremium:String(p.monthlyPremium??""),termPremium:String(p.termPremium??""),deductible:String(p.deductible??""),liabilityLimit:String(p.liabilityLimit??""),propertyDamageLimit:String(p.propertyDamageLimit??""),effectiveDate:p.effectiveDate||"",expirationDate:p.expirationDate||"",reason:"Policy servicing change"});setEditing(true);setDeleteMessage("")}

  async function saveEdit(e){
    e.preventDefault();if(!selected)return;
    const patch={monthlyPremium:Number(editForm.monthlyPremium||0),termPremium:Number(editForm.termPremium||0),deductible:Number(editForm.deductible||0),liabilityLimit:Number(editForm.liabilityLimit||0),propertyDamageLimit:Number(editForm.propertyDamageLimit||0),effectiveDate:editForm.effectiveDate,expirationDate:editForm.expirationDate,version:Number(selected.version||1)+1,updatedAt:serverTimestamp(),updatedBy:staff.id};
    const batch=writeBatch(db);const versionRef=doc(collection(db,"policyVersions"));const endorsementRef=doc(collection(db,"endorsements"));
    batch.update(doc(db,"policies",selected.id),patch);
    batch.set(versionRef,{policyId:selected.id,policyNumber:selected.policyNumber,version:patch.version,reason:editForm.reason||"Policy updated",snapshot:{...snapshot(selected),...patch},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    batch.set(endorsementRef,{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,reason:editForm.reason||"Policy servicing change",before:snapshot(selected),after:{...snapshot(selected),...patch},effectiveDate:patch.effectiveDate,status:"applied",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await batch.commit();setSelected({...selected,...patch});setEditing(false);await load();
  }

  async function scheduleCancellation(){
    if(!selected||!cancelForm.date||!cancelForm.reason)return;
    await updateDoc(doc(db,"policies",selected.id),{status:"cancellation_pending",cancellationEffectiveDate:cancelForm.date,cancellationReason:cancelForm.reason,cancellationScheduledBy:staff.id,cancellationScheduledAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await addDoc(collection(db,"policyVersions"),{policyId:selected.id,policyNumber:selected.policyNumber,version:Number(selected.version||1)+1,reason:"Cancellation scheduled: "+cancelForm.reason,snapshot:{...snapshot(selected),status:"cancellation_pending"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setSelected(null);setCancelForm({date:"",reason:""});await load();
  }

  async function reinstate(p){
    await updateDoc(doc(db,"policies",p.id),{status:"active",cancellationEffectiveDate:null,cancellationReason:null,reinstatedAt:serverTimestamp(),reinstatedBy:staff.id,updatedAt:serverTimestamp()});
    await addDoc(collection(db,"policyVersions"),{policyId:p.id,policyNumber:p.policyNumber,version:Number(p.version||1)+1,reason:"Policy reinstated",snapshot:{...snapshot(p),status:"active"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});setSelected(null);await load();
  }

  async function prepareRenewal(p){
    setRenewForm({monthlyPremium:String(p.monthlyPremium||0),termPremium:String(p.termPremium||0)});
    setMode("renewal");
  }
  async function saveRenewal(){
    await updateDoc(doc(db,"policies",selected.id),{status:"renewal_pending",renewalOffer:{monthlyPremium:Number(renewForm.monthlyPremium||0),termPremium:Number(renewForm.termPremium||0),preparedBy:staff.id,preparedAt:new Date().toISOString()},updatedAt:serverTimestamp()});
    setSelected({...selected,status:"renewal_pending",renewalOffer:{monthlyPremium:Number(renewForm.monthlyPremium||0),termPremium:Number(renewForm.termPremium||0)}});setMode("policy");await load();
  }
  async function acceptRenewal(p){
    const batch=writeBatch(db);const ref=doc(collection(db,"policies"));const start=p.expirationDate;const end=addMonths(start,6);const num=policyNo();
    batch.set(ref,{...p,id:undefined,policyNumber:num,status:"active",version:1,effectiveDate:start,expirationDate:end,monthlyPremium:Number(p.renewalOffer?.monthlyPremium??p.monthlyPremium),termPremium:Number(p.renewalOffer?.termPremium??p.termPremium),priorPolicyId:p.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),issuedBy:staff.id,renewalOf:p.policyNumber});
    batch.update(doc(db,"policies",p.id),{status:"renewed",renewedToPolicyId:ref.id,updatedAt:serverTimestamp()});await batch.commit();setSelected(null);await load();
  }

  async function archivePolicy(p){
    await addDoc(collection(db,"archives"),{recordType:"policy",sourceId:p.id,title:p.policyNumber+" • "+p.customerName,reason:"Policy archived",snapshot:p,archivedBy:staff.id,archivedByName:staff.displayName,archivedAt:serverTimestamp()});
    await updateDoc(doc(db,"policies",p.id),{status:"archived",archivedAt:serverTimestamp(),archivedBy:staff.id,updatedAt:serverTimestamp()});setSelected(null);await load();
  }

  async function permanentlyDelete(p){
    setDeleteMessage("");if(p.status==="active"){setDeleteMessage("Active policies must be cancelled or archived before permanent deletion.");return}
    const [cl,bill,as]=await Promise.all([getDocs(query(collection(db,"claims"),where("policyId","==",p.id))),getDocs(query(collection(db,"billingTransactions"),where("policyId","==",p.id))),getDocs(query(collection(db,"insuredAssets"),where("policyId","==",p.id)))]);
    if(!cl.empty||!bill.empty){setDeleteMessage("This policy has claim or billing history. Archive it instead.");return}
    if(!window.confirm("Permanently delete "+p.policyNumber+"? This cannot be undone."))return;
    const batch=writeBatch(db);as.docs.forEach(d=>batch.delete(d.ref));batch.delete(doc(db,"policies",p.id));await batch.commit();setSelected(null);await load();
  }

  const policyVersions=selected?versions.filter(v=>v.policyId===selected.id).sort((a,b)=>(b.version||0)-(a.version||0)):[];
  const policyEndorsements=selected?endorsements.filter(e=>e.policyId===selected.id):[];

  return <section className="content">
    <div className="workflow-ribbon"><span>Intake</span><span>Customer</span><span>Quote</span><span>Underwriting</span><strong>Policy</strong><span>Service</span></div>
    <div className="page-heading"><div><div className="eyebrow">POLICY ADMINISTRATION</div><h1>Policies</h1><p>Versioned coverage, endorsements, renewals, cancellation workflow, and policy servicing.</p></div></div>

    {approved.length>0&&can(staff,PERMISSIONS.POLICY_ISSUE)&&<div className="issuance-banner"><div><div className="eyebrow">READY TO BIND</div><h3>{approved.length} approved application{approved.length===1?"":"s"} ready for issuance.</h3></div><div className="issuance-stack">{approved.slice(0,3).map(q=><div key={q.id}><span>{q.customerName} • {q.product?.toUpperCase()}</span><button className="primary compact" disabled={issuing===q.id} onClick={()=>issue(q)}><Plus size={15}/>{issuing===q.id?"Issuing…":"Issue policy"}</button></div>)}</div></div>}

    <div className="metric-grid"><article className="metric-card"><div className="metric-icon"><FileCheck2 size={19}/></div><div className="metric-value">{policies.filter(p=>p.status==="active").length}</div><div className="metric-label">Policies in force</div><div className="metric-sub">Active coverage</div></article><article className="metric-card"><div className="metric-icon"><RefreshCw size={19}/></div><div className="metric-value">{policies.filter(p=>p.status==="renewal_pending").length}</div><div className="metric-label">Renewal pending</div><div className="metric-sub">Prepared offers</div></article><article className="metric-card"><div className="metric-icon"><History size={19}/></div><div className="metric-value">{endorsements.length}</div><div className="metric-label">Endorsements</div><div className="metric-sub">Recorded policy changes</div></article><article className="metric-card"><div className="metric-icon"><ShieldCheck size={19}/></div><div className="metric-value">{money(policies.filter(p=>p.status==="active").reduce((s,p)=>s+Number(p.termPremium||0),0))}</div><div className="metric-label">Written premium</div><div className="metric-sub">Active book</div></article></div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Policy book</strong><span>{policies.length} policies</span></div>{policies.length===0?<div className="empty-state"><FileCheck2 size={30}/><h3>No policies have been issued.</h3></div>:<div className="quote-list">{policies.map(p=>{const asset=assetMap[p.id];return <button className="policy-row" key={p.id} onClick={()=>{setSelected(p);setMode("policy");setDeleteMessage("")}}><div className="product-icon">{p.product==="home"?<Home size={18}/>:<Car size={18}/>}</div><div className="quote-main"><strong>{p.customerName}</strong><span>{p.policyNumber} • {asset?.description||p.product?.toUpperCase()}</span></div><div className="quote-money"><strong>{money(p.monthlyPremium)}/mo</strong><span>{p.effectiveDate} → {p.expirationDate}</span></div><span className={"status-pill "+p.status}>{p.status.replaceAll("_"," ")}</span></button>})}</div>}</div>

    {selected&&<div className="modal-backdrop"><div className="modal claim-detail"><div className="modal-head"><div><div className="eyebrow">POLICY RECORD</div><h2>{selected.policyNumber}</h2></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="record-tabs"><button className={mode==="policy"?"active":""} onClick={()=>setMode("policy")}>Policy</button><button className={mode==="versions"?"active":""} onClick={()=>setMode("versions")}>Version history</button><button className={mode==="endorsements"?"active":""} onClick={()=>setMode("endorsements")}>Endorsements</button>{can(staff,PERMISSIONS.POLICY_RENEW)&&<button className={mode==="renewal"?"active":""} onClick={()=>prepareRenewal(selected)}>Renewal</button>}</div>
      {mode==="policy"&&<><div className="policy-hero"><div><span>Named insured</span><strong>{selected.customerName}</strong></div><div><span>Status</span><strong>{selected.status.toUpperCase().replaceAll("_"," ")}</strong></div><div><span>Version</span><strong>v{selected.version||1}</strong></div></div><div className="coverage-grid"><div><span>Monthly premium</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Term premium</span><strong>{money(selected.termPremium)}</strong></div><div><span>Deductible</span><strong>{money(selected.deductible)}</strong></div><div><span>Liability</span><strong>{money(selected.liabilityLimit)}</strong></div><div><span>Property damage</span><strong>{money(selected.propertyDamageLimit)}</strong></div><div><span>Insured asset</span><strong>{assetMap[selected.id]?.description||"Not listed"}</strong></div></div>{deleteMessage&&<div className="error-box">{deleteMessage}</div>}<div className="record-handoff"><span>Continue servicing this policy</span><div><button className="secondary compact" onClick={()=>onNavigate?.("Billing",{policyId:selected.id})}><CreditCard size={14}/> Billing</button><button className="secondary compact" onClick={()=>onNavigate?.("Claims",{customerId:selected.customerId})}><ShieldAlert size={14}/> Claim</button><button className="secondary compact" onClick={()=>onNavigate?.("Customer Workspace",{customerId:selected.customerId})}>Customer <ArrowRight size={14}/></button></div></div>
        <div className="modal-actions policy-admin-actions">{can(staff,PERMISSIONS.POLICY_ENDORSE)&&<button className="secondary" onClick={()=>startEdit(selected)}><Pencil size={15}/> Endorse / edit</button>}{can(staff,PERMISSIONS.POLICY_RENEW)&&["active","renewal_pending"].includes(selected.status)&&<button className="secondary" onClick={()=>prepareRenewal(selected)}><RefreshCw size={15}/> Renewal</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status==="active"&&<button className="secondary danger-soft" onClick={()=>setMode("cancel")}>Schedule cancellation</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&["cancelled","cancellation_pending"].includes(selected.status)&&<button className="primary" onClick={()=>reinstate(selected)}>Reinstate</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status!=="archived"&&<button className="secondary" onClick={()=>archivePolicy(selected)}><Archive size={15}/> Archive</button>}{can(staff,PERMISSIONS.POLICY_DELETE)&&<button className="secondary danger-soft" onClick={()=>permanentlyDelete(selected)}><Trash2 size={15}/> Delete permanently</button>}</div></>}
      {mode==="versions"&&<div className="timeline">{policyVersions.map(v=><div key={v.id}><span className="timeline-dot"></span><div><strong>Version {v.version} — {v.reason}</strong><p>{v.snapshot?.status||"policy"} • {money(v.snapshot?.monthlyPremium)}/mo</p><small>{v.createdByName||"Staff"} • {v.createdAt?.toDate?v.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div>}
      {mode==="endorsements"&&<div className="timeline">{policyEndorsements.length===0?<div className="empty-state compact-empty">No endorsements yet.</div>:policyEndorsements.map(e=><div key={e.id}><span className="timeline-dot"></span><div><strong>{e.reason}</strong><p>Effective {e.effectiveDate} • {e.status}</p><small>{e.createdByName||"Staff"}</small></div></div>)}</div>}
      {mode==="renewal"&&<div className="renewal-box"><div className="eyebrow">RENEWAL OFFER</div><h3>Prepare next policy term</h3><div className="two-col"><label>Monthly premium<input type="number" value={renewForm.monthlyPremium} onChange={e=>setRenewForm({...renewForm,monthlyPremium:e.target.value})}/></label><label>Term premium<input type="number" value={renewForm.termPremium} onChange={e=>setRenewForm({...renewForm,termPremium:e.target.value})}/></label></div><div className="modal-actions"><button className="secondary" onClick={saveRenewal}>Save renewal offer</button>{selected.status==="renewal_pending"&&<button className="primary" onClick={()=>acceptRenewal(selected)}>Accept & issue renewal</button>}</div></div>}
      {mode==="cancel"&&<div className="renewal-box"><div className="eyebrow">CANCELLATION WORKFLOW</div><h3>Schedule cancellation</h3><label>Effective date<input type="date" value={cancelForm.date} onChange={e=>setCancelForm({...cancelForm,date:e.target.value})}/></label><label>Reason<textarea rows="3" value={cancelForm.reason} onChange={e=>setCancelForm({...cancelForm,reason:e.target.value})}/></label><div className="modal-actions"><button className="secondary" onClick={()=>setMode("policy")}>Back</button><button className="primary danger-soft" onClick={scheduleCancellation}>Schedule cancellation</button></div></div>}
    </div></div>}

    {editing&&selected&&<div className="modal-backdrop"><form className="modal wide" onSubmit={saveEdit}><div className="modal-head"><div><div className="eyebrow">POLICY ENDORSEMENT</div><h2>Change {selected.policyNumber}</h2><p>The prior version will be preserved automatically.</p></div><button type="button" onClick={()=>setEditing(false)}><X/></button></div><label>Reason for change<input value={editForm.reason} onChange={e=>setEditForm({...editForm,reason:e.target.value})} required/></label><div className="three-col"><label>Monthly premium<input type="number" value={editForm.monthlyPremium} onChange={e=>setEditForm({...editForm,monthlyPremium:e.target.value})}/></label><label>Term premium<input type="number" value={editForm.termPremium} onChange={e=>setEditForm({...editForm,termPremium:e.target.value})}/></label><label>Deductible<input type="number" value={editForm.deductible} onChange={e=>setEditForm({...editForm,deductible:e.target.value})}/></label></div><div className="two-col"><label>Liability limit<input type="number" value={editForm.liabilityLimit} onChange={e=>setEditForm({...editForm,liabilityLimit:e.target.value})}/></label><label>Property damage limit<input type="number" value={editForm.propertyDamageLimit} onChange={e=>setEditForm({...editForm,propertyDamageLimit:e.target.value})}/></label></div><div className="two-col"><label>Effective date<input type="date" value={editForm.effectiveDate} onChange={e=>setEditForm({...editForm,effectiveDate:e.target.value})}/></label><label>Expiration date<input type="date" value={editForm.expirationDate} onChange={e=>setEditForm({...editForm,expirationDate:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditing(false)}>Cancel</button><button className="primary">Apply endorsement</button></div></form></div>}
  </section>
}
