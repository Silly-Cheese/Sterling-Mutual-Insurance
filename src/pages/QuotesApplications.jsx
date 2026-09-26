import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {ArrowRight,Car,CheckCircle2,ClipboardList,GitCompare,Home,Plus,ShieldCheck,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const initial={customerId:"",product:"auto",coverageTier:"standard",assetType:"vehicle",assetDescription:"",basePremium:"140",deductible:"1000",liabilityLimit:"100000",propertyDamageLimit:"50000",riskNotes:""};
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0));
const quoteNo=()=> "Q-"+Date.now().toString().slice(-8);

export default function QuotesApplications({staff,initialCustomerId,openNew}){
  const [quotes,setQuotes]=useState([]),[customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(initial),[saving,setSaving]=useState(false),[selected,setSelected]=useState(null),[compareIds,setCompareIds]=useState([]);

  async function load(){
    const [qSnap,cSnap]=await Promise.all([getDocs(collection(db,"quotes")),getDocs(collection(db,"customers"))]);
    setQuotes(qSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setCustomers(cSnap.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId){setForm(v=>({...v,customerId:initialCustomerId}));setOpen(true)}else if(openNew)setOpen(true)},[initialCustomerId,openNew]);
  const customerMap=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers]);

  function calculatedPremium(q){
    const base=Number(q.basePremium||0);let adjustment=q.product==="auto"?35:q.product==="home"?25:45;
    if(Number(q.deductible)<=500)adjustment+=30;if(Number(q.deductible)>=2000)adjustment-=15;
    const tier=q.coverageTier==="basic"?.9:q.coverageTier==="premium"?1.25:1;
    return Math.max(25,(base+adjustment)*tier);
  }

  async function createQuote(e){
    e.preventDefault();setSaving(true);
    try{
      const customer=customerMap[form.customerId],premium=calculatedPremium(form);
      await addDoc(collection(db,"quotes"),{...form,quoteNumber:quoteNo(),customerName:customer?.displayName||"Unknown customer",monthlyPremium:premium,sixMonthPremium:premium*6,status:"draft",underwritingLevel:"unreviewed",applicationChecklist:{customerInfo:true,assetInfo:Boolean(form.assetDescription),lossHistory:false,documents:false,paymentSelection:false},createdBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await updateDoc(doc(db,"customers",form.customerId),{status:"quoted",updatedAt:serverTimestamp(),updatedBy:staff.id});
      setForm(initial);setOpen(false);await load();
    }finally{setSaving(false)}
  }

  async function setStatus(q,status,extra={}){
    await updateDoc(doc(db,"quotes",q.id),{status,...extra,updatedAt:serverTimestamp()});
    if(status==="submitted")await updateDoc(doc(db,"customers",q.customerId),{status:"applicant",updatedAt:serverTimestamp(),updatedBy:staff.id});
    if(["approved","conditional_approval"].includes(status))await updateDoc(doc(db,"customers",q.customerId),{status:"approved_applicant",updatedAt:serverTimestamp(),updatedBy:staff.id});
    await load()
  }
  async function setReview(q,level){
    const status=level==="declined"?"declined":level==="conditional"?"conditional_approval":level==="straight"?"approved":"submitted";
    await setStatus(q,status,{underwritingLevel:level,reviewedBy:staff.id,reviewedAt:serverTimestamp()});
  }
  async function toggleChecklist(q,key){await updateDoc(doc(db,"quotes",q.id),{["applicationChecklist."+key]:!q.applicationChecklist?.[key],updatedAt:serverTimestamp()});await load()}
  function toggleCompare(id){setCompareIds(v=>v.includes(id)?v.filter(x=>x!==id):v.length<3?[...v,id]:v)}
  const compare=quotes.filter(q=>compareIds.includes(q.id));

  return <section className="content">
    <div className="workflow-ribbon"><span>Intake</span><span>Customer</span><strong>Quote</strong><span>Underwriting</span><span>Policy</span><span>Service</span></div>
    <div className="page-heading"><div><div className="eyebrow">SALES + UNDERWRITING</div><h1>Quotes & Applications</h1><p>Offer coverage choices, complete applications, compare options, and route underwriting reviews.</p></div>{can(staff,PERMISSIONS.QUOTE_CREATE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={17}/> New quote</button>}</div>

    <div className="metric-grid"><article className="metric-card"><div className="metric-value">{quotes.filter(q=>q.status==="draft").length}</div><div className="metric-label">Draft quotes</div></article><article className="metric-card"><div className="metric-value">{quotes.filter(q=>q.status==="submitted").length}</div><div className="metric-label">Manual review</div></article><article className="metric-card"><div className="metric-value">{quotes.filter(q=>["approved","conditional_approval"].includes(q.status)).length}</div><div className="metric-label">Approved / conditional</div></article><article className="metric-card"><div className="metric-value">{quotes.filter(q=>q.status==="issued").length}</div><div className="metric-label">Issued</div></article></div>

    {compare.length>1&&<div className="comparison-card"><div className="table-toolbar"><strong><GitCompare size={15}/> Coverage comparison</strong><button className="secondary compact" onClick={()=>setCompareIds([])}>Clear</button></div><div className="comparison-grid">{compare.map(q=><div key={q.id}><span className="status-pill">{q.coverageTier||"standard"}</span><h3>{q.customerName}</h3><strong>{money(q.monthlyPremium)}/mo</strong><p>{money(q.deductible)} deductible</p><small>Liability {money(q.liabilityLimit)} • Property {money(q.propertyDamageLimit)}</small></div>)}</div></div>}

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Application pipeline</strong><span>{quotes.length} total</span></div>{quotes.length===0?<div className="empty-state"><ClipboardList size={30}/><h3>No quotes yet.</h3></div>:<div className="quote-list">{quotes.map(q=><article className="quote-row" key={q.id}>
      <div className="compare-check"><input type="checkbox" checked={compareIds.includes(q.id)} onChange={()=>toggleCompare(q.id)} title="Compare"/></div>
      <div className="product-icon">{q.product==="home"?<Home size={18}/>:<Car size={18}/>}</div>
      <button className="quote-main quote-open" onClick={()=>setSelected(q)}><strong>{q.customerName}</strong><span>{q.quoteNumber} • {(q.coverageTier||"standard").toUpperCase()} • {q.assetDescription||"Asset not described"}</span></button>
      <div className="quote-money"><strong>{money(q.monthlyPremium)}/mo</strong><span>{q.underwritingLevel||"unreviewed"}</span></div>
      <span className={"status-pill "+q.status}>{q.status.replaceAll("_"," ")}</span>
      <div className="quote-actions">{q.status==="draft"&&can(staff,PERMISSIONS.QUOTE_SUBMIT)&&<button className="secondary compact" onClick={()=>setStatus(q,"submitted",{submittedAt:serverTimestamp()})}>Submit</button>}{q.status==="needs_information"&&can(staff,PERMISSIONS.QUOTE_UPDATE)&&<button className="secondary compact" onClick={()=>setStatus(q,"submitted")}>Resubmit</button>}</div>
    </article>)}</div>}</div>

    {selected&&<div className="modal-backdrop"><div className="modal claim-detail"><div className="modal-head"><div><div className="eyebrow">APPLICATION</div><h2>{selected.quoteNumber}</h2><p>{selected.customerName} • {selected.coverageTier||"standard"} option</p></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="application-checklist"><div className="eyebrow">APPLICATION CHECKLIST</div>{Object.entries({customerInfo:"Customer info",assetInfo:"Asset details",lossHistory:"Loss history",documents:"Documents",paymentSelection:"Payment selection"}).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(selected.applicationChecklist?.[key])} disabled={!can(staff,PERMISSIONS.QUOTE_UPDATE)} onChange={async()=>{await toggleChecklist(selected,key);setSelected(v=>({...v,applicationChecklist:{...v.applicationChecklist,[key]:!v.applicationChecklist?.[key]}}))}}/><span>{label}</span></label>)}</div>
      {can(staff,PERMISSIONS.UNDERWRITING_REVIEW)&&<div className="underwriting-panel"><div className="eyebrow">UNDERWRITING ROUTE</div><h3>Review level</h3><div className="action-stack"><button className="secondary compact" onClick={()=>setReview(selected,"straight")}>Straight-through</button><button className="secondary compact" onClick={()=>setReview(selected,"manual")}>Manual review</button><button className="secondary compact" onClick={()=>setReview(selected,"senior")}>Senior review</button><button className="secondary compact" onClick={()=>setReview(selected,"conditional")}>Conditional approval</button><button className="secondary compact danger-soft" onClick={()=>setReview(selected,"declined")}>Decline</button></div></div>}
      <div className="record-summary"><div><span>Monthly</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Six month</span><strong>{money(selected.sixMonthPremium)}</strong></div><div><span>Deductible</span><strong>{money(selected.deductible)}</strong></div><div><span>Review</span><strong>{selected.underwritingLevel||"Unreviewed"}</strong></div></div>
    </div></div>}

    {open&&<div className="modal-backdrop"><form className="modal wide" onSubmit={createQuote}><div className="modal-head"><div><div className="eyebrow">QUOTE BUILDER</div><h2>New insurance quote</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div>
      <div className="three-col"><label>Customer<select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label><label>Product<select value={form.product} onChange={e=>setForm({...form,product:e.target.value,assetType:e.target.value==="home"?"property":"vehicle"})}><option value="auto">Auto</option><option value="home">Home / Property</option><option value="business">Commercial</option></select></label><label>Coverage option<select value={form.coverageTier} onChange={e=>setForm({...form,coverageTier:e.target.value})}><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label></div>
      <label>Insured asset<input value={form.assetDescription} onChange={e=>setForm({...form,assetDescription:e.target.value})} required/></label>
      <div className="three-col"><label>Base monthly premium<input type="number" min="1" value={form.basePremium} onChange={e=>setForm({...form,basePremium:e.target.value})}/></label><label>Deductible<select value={form.deductible} onChange={e=>setForm({...form,deductible:e.target.value})}><option value="500">$500</option><option value="1000">$1,000</option><option value="2000">$2,000</option><option value="2500">$2,500</option></select></label><label>Estimated premium<input value={money(calculatedPremium(form))+" / month"} readOnly/></label></div>
      <div className="two-col"><label>Liability limit<input type="number" value={form.liabilityLimit} onChange={e=>setForm({...form,liabilityLimit:e.target.value})}/></label><label>Property damage limit<input type="number" value={form.propertyDamageLimit} onChange={e=>setForm({...form,propertyDamageLimit:e.target.value})}/></label></div>
      <label>Risk / underwriting notes<textarea rows="4" value={form.riskNotes} onChange={e=>setForm({...form,riskNotes:e.target.value})}/></label>
      <div className="premium-preview"><div><span>Monthly premium</span><strong>{money(calculatedPremium(form))}</strong></div><div><span>Six-month premium</span><strong>{money(calculatedPremium(form)*6)}</strong></div></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Creating…":"Create option"}</button></div>
    </form></div>}
  </section>
}
