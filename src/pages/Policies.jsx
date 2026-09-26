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
  const [policies,setPolicies]=useState([]),[quotes,setQuotes]=useState([]),[assets,setAssets]=useState([]),[versions,setVersions]=useState([]),[endorsements,setEndorsements]=useState([]),[cancellations,setCancellations]=useState([]),[selected,setSelected]=useState(null),[issuing,setIssuing]=useState(null),[editing,setEditing]=useState(false),[editForm,setEditForm]=useState(null),[mode,setMode]=useState("policy"),[deleteMessage,setDeleteMessage]=useState(""),[cancelForm,setCancelForm]=useState({effectiveDate:"",noticeDate:new Date().toISOString().slice(0,10),reasonCategory:"underwriting",reason:"",initiatedBy:"company"}),[renewForm,setRenewForm]=useState({monthlyPremium:"",termPremium:""});

  async function load(){
    const [p,q,a,v,e,can]=await Promise.all(["policies","quotes","insuredAssets","policyVersions","endorsements","policyCancellations"].map(async n=>{try{return await getDocs(collection(db,n))}catch{return {docs:[]}}}));
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));
    setQuotes(q.docs.map(d=>({id:d.id,...d.data()})));setAssets(a.docs.map(d=>({id:d.id,...d.data()})));setVersions(v.docs.map(d=>({id:d.id,...d.data()})));setEndorsements(e.docs.map(d=>({id:d.id,...d.data()})));setCancellations(can.docs.map(d=>({id:d.id,...d.data()})));
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
    if(!selected||!cancelForm.effectiveDate||!cancelForm.reason)return;
    const ref=await addDoc(collection(db,"policyCancellations"),{
      policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,
      source:"policy",initiatedByType:cancelForm.initiatedBy,reasonCategory:cancelForm.reasonCategory,reason:cancelForm.reason,
      stage:"notice_pending",status:"open",noticeDate:cancelForm.noticeDate,effectiveDate:cancelForm.effectiveDate,
      createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()
    });
    await updateDoc(doc(db,"policies",selected.id),{status:"cancellation_pending",cancellationCaseId:ref.id,cancellationStage:"notice_pending",cancellationEffectiveDate:cancelForm.effectiveDate,cancellationReason:cancelForm.reason,cancellationReasonCategory:cancelForm.reasonCategory,cancellationScheduledBy:staff.id,cancellationScheduledAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await addDoc(collection(db,"policyVersions"),{policyId:selected.id,policyNumber:selected.policyNumber,version:Number(selected.version||1)+1,reason:"Cancellation initiated: "+cancelForm.reason,snapshot:{...snapshot(selected),status:"cancellation_pending"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setSelected({...selected,status:"cancellation_pending",cancellationCaseId:ref.id,cancellationStage:"notice_pending",cancellationEffectiveDate:cancelForm.effectiveDate,cancellationReason:cancelForm.reason});
    setMode("cancellation");await load();
  }

  async function issueCancellationNotice(c){
    await updateDoc(doc(db,"policyCancellations",c.id),{stage:"notice_sent",noticeSentAt:serverTimestamp(),noticeSentBy:staff.id});
    await updateDoc(doc(db,"policies",selected.id),{cancellationStage:"notice_sent",updatedAt:serverTimestamp()});
    await addDoc(collection(db,"documents"),{customerId:selected.customerId,policyId:selected.id,policyNumber:selected.policyNumber,type:"cancellation_notice",title:"Policy Cancellation Notice",status:"available",reason:c.reason,effectiveDate:c.effectiveDate,createdAt:serverTimestamp(),createdBy:staff.id});
    await load();
  }

  async function markCancellationPendingEffective(c){
    await updateDoc(doc(db,"policyCancellations",c.id),{stage:"pending_effective",pendingEffectiveAt:serverTimestamp(),updatedBy:staff.id});
    await updateDoc(doc(db,"policies",selected.id),{cancellationStage:"pending_effective",updatedAt:serverTimestamp()});
    await load();
  }

  async function finalizeCancellation(c){
    await updateDoc(doc(db,"policyCancellations",c.id),{stage:"cancelled",status:"completed",finalizedAt:serverTimestamp(),finalizedBy:staff.id});
    await updateDoc(doc(db,"policies",selected.id),{status:"cancelled",cancellationStage:"cancelled",cancelledAt:serverTimestamp(),cancelledBy:staff.id,updatedAt:serverTimestamp()});
    await addDoc(collection(db,"documents"),{customerId:selected.customerId,policyId:selected.id,policyNumber:selected.policyNumber,type:"cancellation_confirmation",title:"Cancellation Confirmation",status:"available",effectiveDate:c.effectiveDate,createdAt:serverTimestamp(),createdBy:staff.id});
    await addDoc(collection(db,"policyVersions"),{policyId:selected.id,policyNumber:selected.policyNumber,version:Number(selected.version||1)+1,reason:"Policy cancelled: "+c.reason,snapshot:{...snapshot(selected),status:"cancelled"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setSelected({...selected,status:"cancelled",cancellationStage:"cancelled"});await load();
  }

  async function rescindCancellation(c,reason="Cancellation rescinded"){
    await updateDoc(doc(db,"policyCancellations",c.id),{stage:"rescinded",status:"rescinded",rescindedAt:serverTimestamp(),rescindedBy:staff.id,rescindReason:reason});
    await updateDoc(doc(db,"policies",selected.id),{status:"active",cancellationCaseId:null,cancellationStage:null,cancellationEffectiveDate:null,cancellationReason:null,updatedAt:serverTimestamp()});
    await addDoc(collection(db,"policyVersions"),{policyId:selected.id,policyNumber:selected.policyNumber,version:Number(selected.version||1)+1,reason:"Cancellation rescinded",snapshot:{...snapshot(selected),status:"active"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setSelected({...selected,status:"active",cancellationCaseId:null,cancellationStage:null});setMode("policy");await load();
  }

  async function reinstate(p){
    const latest=cancellations.filter(c=>c.policyId===p.id).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
    if(latest&&latest.status==="open")return rescindCancellation(latest,"Policy reinstated before cancellation completed");
    await updateDoc(doc(db,"policies",p.id),{status:"active",cancellationEffectiveDate:null,cancellationReason:null,cancellationStage:null,reinstatedAt:serverTimestamp(),reinstatedBy:staff.id,updatedAt:serverTimestamp()});
    await addDoc(collection(db,"policyVersions"),{policyId:p.id,policyNumber:p.policyNumber,version:Number(p.version||1)+1,reason:"Policy reinstated",snapshot:{...snapshot(p),status:"active"},createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setSelected({...p,status:"active",cancellationStage:null});setMode("policy");await load();
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
      <div className="record-tabs"><button className={mode==="policy"?"active":""} onClick={()=>setMode("policy")}>Policy</button><button className={mode==="versions"?"active":""} onClick={()=>setMode("versions")}>Version history</button><button className={mode==="endorsements"?"active":""} onClick={()=>setMode("endorsements")}>Endorsements</button><button className={mode==="cancellation"?"active":""} onClick={()=>setMode("cancellation")}>Cancellation</button>{can(staff,PERMISSIONS.POLICY_RENEW)&&<button className={mode==="renewal"?"active":""} onClick={()=>prepareRenewal(selected)}>Renewal</button>}</div>
      {mode==="policy"&&<><div className="policy-hero"><div><span>Named insured</span><strong>{selected.customerName}</strong></div><div><span>Status</span><strong>{selected.status.toUpperCase().replaceAll("_"," ")}</strong></div><div><span>Version</span><strong>v{selected.version||1}</strong></div></div><div className="coverage-grid"><div><span>Monthly premium</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Term premium</span><strong>{money(selected.termPremium)}</strong></div><div><span>Deductible</span><strong>{money(selected.deductible)}</strong></div><div><span>Liability</span><strong>{money(selected.liabilityLimit)}</strong></div><div><span>Property damage</span><strong>{money(selected.propertyDamageLimit)}</strong></div><div><span>Insured asset</span><strong>{assetMap[selected.id]?.description||"Not listed"}</strong></div></div>{deleteMessage&&<div className="error-box">{deleteMessage}</div>}<div className="record-handoff"><span>Continue servicing this policy</span><div><button className="secondary compact" onClick={()=>onNavigate?.("Billing",{policyId:selected.id})}><CreditCard size={14}/> Billing</button><button className="secondary compact" onClick={()=>onNavigate?.("Claims",{customerId:selected.customerId})}><ShieldAlert size={14}/> Claim</button><button className="secondary compact" onClick={()=>onNavigate?.("Customer Workspace",{customerId:selected.customerId})}>Customer <ArrowRight size={14}/></button></div></div>
        <div className="modal-actions policy-admin-actions">{can(staff,PERMISSIONS.POLICY_ENDORSE)&&<button className="secondary" onClick={()=>startEdit(selected)}><Pencil size={15}/> Endorse / edit</button>}{can(staff,PERMISSIONS.POLICY_RENEW)&&["active","renewal_pending"].includes(selected.status)&&<button className="secondary" onClick={()=>prepareRenewal(selected)}><RefreshCw size={15}/> Renewal</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status==="active"&&<button className="secondary danger-soft" onClick={()=>setMode("cancel")}>Schedule cancellation</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&["cancelled","cancellation_pending"].includes(selected.status)&&<button className="primary" onClick={()=>reinstate(selected)}>Reinstate</button>}{can(staff,PERMISSIONS.POLICY_UPDATE)&&selected.status!=="archived"&&<button className="secondary" onClick={()=>archivePolicy(selected)}><Archive size={15}/> Archive</button>}{can(staff,PERMISSIONS.POLICY_DELETE)&&<button className="secondary danger-soft" onClick={()=>permanentlyDelete(selected)}><Trash2 size={15}/> Delete permanently</button>}</div></>}
      {mode==="versions"&&<div className="timeline">{policyVersions.map(v=><div key={v.id}><span className="timeline-dot"></span><div><strong>Version {v.version} — {v.reason}</strong><p>{v.snapshot?.status||"policy"} • {money(v.snapshot?.monthlyPremium)}/mo</p><small>{v.createdByName||"Staff"} • {v.createdAt?.toDate?v.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div>}
      {mode==="endorsements"&&<div className="timeline">{policyEndorsements.length===0?<div className="empty-state compact-empty">No endorsements yet.</div>:policyEndorsements.map(e=><div key={e.id}><span className="timeline-dot"></span><div><strong>{e.reason}</strong><p>Effective {e.effectiveDate} • {e.status}</p><small>{e.createdByName||"Staff"}</small></div></div>)}</div>}
      {mode==="renewal"&&<div className="renewal-box"><div className="eyebrow">RENEWAL OFFER</div><h3>Prepare next policy term</h3><div className="two-col"><label>Monthly premium<input type="number" value={renewForm.monthlyPremium} onChange={e=>setRenewForm({...renewForm,monthlyPremium:e.target.value})}/></label><label>Term premium<input type="number" value={renewForm.termPremium} onChange={e=>setRenewForm({...renewForm,termPremium:e.target.value})}/></label></div><div className="modal-actions"><button className="secondary" onClick={saveRenewal}>Save renewal offer</button>{selected.status==="renewal_pending"&&<button className="primary" onClick={()=>acceptRenewal(selected)}>Accept & issue renewal</button>}</div></div>}
      {mode==="cancel"&&<div className="cancellation-create"><div className="eyebrow">START CANCELLATION</div><h3>Open cancellation case</h3><div className="two-col"><label>Initiated by<select value={cancelForm.initiatedBy} onChange={e=>setCancelForm({...cancelForm,initiatedBy:e.target.value})}><option value="company">Company</option><option value="customer">Customer request</option><option value="billing">Billing / nonpayment</option></select></label><label>Reason category<select value={cancelForm.reasonCategory} onChange={e=>setCancelForm({...cancelForm,reasonCategory:e.target.value})}><option value="nonpayment">Nonpayment</option><option value="underwriting">Underwriting</option><option value="customer_request">Customer request</option><option value="misrepresentation">Misrepresentation</option><option value="risk_change">Material risk change</option><option value="other">Other</option></select></label></div><div className="two-col"><label>Notice date<input type="date" value={cancelForm.noticeDate} onChange={e=>setCancelForm({...cancelForm,noticeDate:e.target.value})}/></label><label>Effective date<input type="date" value={cancelForm.effectiveDate} onChange={e=>setCancelForm({...cancelForm,effectiveDate:e.target.value})}/></label></div><label>Detailed reason<textarea rows="4" value={cancelForm.reason} onChange={e=>setCancelForm({...cancelForm,reason:e.target.value})}/></label><div className="notice-box">Opening a cancellation case does not immediately terminate coverage. It creates a notice and review workflow leading to the effective date.</div><div className="modal-actions"><button className="secondary" onClick={()=>setMode("policy")}>Back</button><button className="primary danger-soft" onClick={scheduleCancellation}>Open cancellation case</button></div></div>}
      {mode==="cancellation"&&<CancellationPanel policy={selected} cases={cancellations.filter(c=>c.policyId===selected.id)} staff={staff} onStart={()=>setMode("cancel")} onIssueNotice={issueCancellationNotice} onPending={markCancellationPendingEffective} onFinalize={finalizeCancellation} onRescind={rescindCancellation} onReinstate={()=>reinstate(selected)}/>} 
    </div></div>}

    {editing&&selected&&<div className="modal-backdrop"><form className="modal wide" onSubmit={saveEdit}><div className="modal-head"><div><div className="eyebrow">POLICY ENDORSEMENT</div><h2>Change {selected.policyNumber}</h2><p>The prior version will be preserved automatically.</p></div><button type="button" onClick={()=>setEditing(false)}><X/></button></div><label>Reason for change<input value={editForm.reason} onChange={e=>setEditForm({...editForm,reason:e.target.value})} required/></label><div className="three-col"><label>Monthly premium<input type="number" value={editForm.monthlyPremium} onChange={e=>setEditForm({...editForm,monthlyPremium:e.target.value})}/></label><label>Term premium<input type="number" value={editForm.termPremium} onChange={e=>setEditForm({...editForm,termPremium:e.target.value})}/></label><label>Deductible<input type="number" value={editForm.deductible} onChange={e=>setEditForm({...editForm,deductible:e.target.value})}/></label></div><div className="two-col"><label>Liability limit<input type="number" value={editForm.liabilityLimit} onChange={e=>setEditForm({...editForm,liabilityLimit:e.target.value})}/></label><label>Property damage limit<input type="number" value={editForm.propertyDamageLimit} onChange={e=>setEditForm({...editForm,propertyDamageLimit:e.target.value})}/></label></div><div className="two-col"><label>Effective date<input type="date" value={editForm.effectiveDate} onChange={e=>setEditForm({...editForm,effectiveDate:e.target.value})}/></label><label>Expiration date<input type="date" value={editForm.expirationDate} onChange={e=>setEditForm({...editForm,expirationDate:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditing(false)}>Cancel</button><button className="primary">Apply endorsement</button></div></form></div>}
  </section>
}


function CancellationPanel({policy,cases,staff,onStart,onIssueNotice,onPending,onFinalize,onRescind,onReinstate}){
  const sorted=[...cases].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  const current=sorted.find(c=>c.status==="open");
  const stage=current?.stage||policy.cancellationStage||null;
  const stages=["notice_pending","notice_sent","pending_effective","cancelled"];
  return <div className="cancellation-panel">
    {!current&&policy.status!=="cancelled"&&<div className="empty-state compact-empty"><h3>No open cancellation case.</h3><p>Coverage remains active until a cancellation case progresses to finalization.</p>{can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="secondary" onClick={onStart}>Start cancellation</button>}</div>}
    {current&&<><div className="cancellation-header"><div><div className="eyebrow">OPEN CANCELLATION CASE</div><h3>{current.reasonCategory?.replaceAll("_"," ")}</h3><p>{current.reason}</p></div><span className="status-pill cancellation_pending">{stage?.replaceAll("_"," ")}</span></div><div className="cancellation-steps">{stages.map((s,i)=>{const currentIndex=stages.indexOf(stage);return <div className={i<=currentIndex?"done":""} key={s}><span>{i+1}</span><strong>{s.replaceAll("_"," ")}</strong></div>})}</div><div className="record-summary"><div><span>Notice date</span><strong>{current.noticeDate}</strong></div><div><span>Effective date</span><strong>{current.effectiveDate}</strong></div><div><span>Initiated by</span><strong>{current.initiatedByType||current.source}</strong></div><div><span>Status</span><strong>{current.status}</strong></div></div><div className="cancellation-actions">{stage==="notice_pending"&&can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="primary" onClick={()=>onIssueNotice(current)}>Issue cancellation notice</button>}{stage==="notice_sent"&&can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="primary" onClick={()=>onPending(current)}>Mark pending effective date</button>}{["notice_pending","notice_sent","pending_effective"].includes(stage)&&can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="secondary" onClick={()=>onRescind(current,"Cancellation rescinded by staff")}>Rescind cancellation</button>}{stage==="pending_effective"&&can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="secondary danger-soft" onClick={()=>onFinalize(current)}>Finalize cancellation</button>}</div></>}
    {policy.status==="cancelled"&&!current&&<div className="cancelled-state"><div className="eyebrow">COVERAGE TERMINATED</div><h3>This policy is cancelled.</h3><p>Reinstatement creates a new servicing event while preserving the cancellation history.</p>{can(staff,PERMISSIONS.POLICY_UPDATE)&&<button className="primary" onClick={onReinstate}>Reinstate policy</button>}</div>}
    {sorted.length>0&&<div className="timeline cancellation-history">{sorted.map(c=><div key={c.id}><span className="timeline-dot"></span><div><strong>{c.reasonCategory?.replaceAll("_"," ")||"Cancellation"}</strong><p>{c.reason} • {c.stage?.replaceAll("_"," ")}</p><small>{c.status} • effective {c.effectiveDate}</small></div></div>)}</div>}
  </div>
}
