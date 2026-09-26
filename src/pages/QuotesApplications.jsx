import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {ArrowRight,Car,CheckCircle2,ClipboardList,Home,Plus,ShieldCheck,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const initial={customerId:"",product:"auto",assetType:"vehicle",assetDescription:"",basePremium:"140",deductible:"1000",liabilityLimit:"100000",propertyDamageLimit:"50000",riskNotes:""};

function money(v){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v||0))}
function quoteNo(){return "Q-"+Date.now().toString().slice(-8)}

export default function QuotesApplications({staff,initialCustomerId}){
  const [quotes,setQuotes]=useState([]),[customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(initial),[saving,setSaving]=useState(false);

  async function load(){
    const [qSnap,cSnap]=await Promise.all([getDocs(collection(db,"quotes")),getDocs(collection(db,"customers"))]);
    setQuotes(qSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setCustomers(cSnap.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialCustomerId){setForm(v=>({...v,customerId:initialCustomerId}));setOpen(true)}},[initialCustomerId]);

  const customerMap=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers]);

  function calculatedPremium(q){
    const base=Number(q.basePremium||0);
    let adjustment=0;
    if(q.product==="auto") adjustment+=35;
    if(q.product==="home") adjustment+=25;
    if(Number(q.deductible)<=500) adjustment+=30;
    if(Number(q.deductible)>=2000) adjustment-=15;
    return Math.max(25,base+adjustment);
  }

  async function createQuote(e){
    e.preventDefault(); setSaving(true);
    try{
      const customer=customerMap[form.customerId];
      const premium=calculatedPremium(form);
      await addDoc(collection(db,"quotes"),{
        ...form,
        quoteNumber:quoteNo(),
        customerName:customer?.displayName||"Unknown customer",
        monthlyPremium:premium,
        sixMonthPremium:premium*6,
        status:"draft",
        createdBy:staff.id,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
      setForm(initial);setOpen(false);await load();
    }finally{setSaving(false)}
  }

  async function setStatus(q,status,extra={}){
    await updateDoc(doc(db,"quotes",q.id),{status,...extra,updatedAt:serverTimestamp()});
    await load();
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">SALES + UNDERWRITING</div><h1>Quotes & Applications</h1><p>Build coverage, submit applications, and move business through underwriting.</p></div>{can(staff,PERMISSIONS.QUOTE_CREATE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={17}/> New quote</button>}</div>

    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><ClipboardList size={19}/></div><div className="metric-value">{quotes.filter(q=>q.status==="draft").length}</div><div className="metric-label">Draft quotes</div><div className="metric-sub">Agent workspace</div></article>
      <article className="metric-card"><div className="metric-icon"><ArrowRight size={19}/></div><div className="metric-value">{quotes.filter(q=>q.status==="submitted").length}</div><div className="metric-label">Awaiting underwriting</div><div className="metric-sub">Submitted applications</div></article>
      <article className="metric-card"><div className="metric-icon"><ShieldCheck size={19}/></div><div className="metric-value">{quotes.filter(q=>q.status==="approved").length}</div><div className="metric-label">Approved</div><div className="metric-sub">Ready to issue</div></article>
      <article className="metric-card"><div className="metric-icon"><CheckCircle2 size={19}/></div><div className="metric-value">{quotes.filter(q=>q.status==="issued").length}</div><div className="metric-label">Issued</div><div className="metric-sub">Converted to policy</div></article>
    </div>

    <div className="table-card workflow-table">
      <div className="table-toolbar"><strong>Application pipeline</strong><span>{quotes.length} total</span></div>
      {quotes.length===0?<div className="empty-state"><ClipboardList size={30}/><h3>No quotes yet.</h3><p>Create a quote for an existing customer to start the underwriting workflow.</p></div>:
      <div className="quote-list">{quotes.map(q=><article className="quote-row" key={q.id}>
        <div className="product-icon">{q.product==="home"?<Home size={18}/>:<Car size={18}/>}</div>
        <div className="quote-main"><strong>{q.customerName}</strong><span>{q.quoteNumber} • {q.product?.toUpperCase()} • {q.assetDescription||"Asset not described"}</span></div>
        <div className="quote-money"><strong>{money(q.monthlyPremium)}/mo</strong><span>{money(q.sixMonthPremium)} / 6 mo</span></div>
        <span className={"status-pill "+q.status}>{q.status}</span>
        <div className="quote-actions">
          {q.status==="draft"&&can(staff,PERMISSIONS.QUOTE_SUBMIT)&&<button className="secondary compact" onClick={()=>setStatus(q,"submitted",{submittedAt:serverTimestamp()})}>Submit</button>}
          {q.status==="submitted"&&can(staff,PERMISSIONS.UNDERWRITING_REVIEW)&&<><button className="secondary compact" onClick={()=>setStatus(q,"needs_information")}>Request info</button><button className="primary compact" onClick={()=>setStatus(q,"approved",{approvedBy:staff.id,approvedAt:serverTimestamp()})}>Approve</button></>}
          {q.status==="needs_information"&&can(staff,PERMISSIONS.QUOTE_UPDATE)&&<button className="secondary compact" onClick={()=>setStatus(q,"submitted")}>Resubmit</button>}
        </div>
      </article>)}</div>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal wide" onSubmit={createQuote}>
      <div className="modal-head"><div><div className="eyebrow">QUOTE BUILDER</div><h2>New insurance quote</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div>
      <div className="two-col"><label>Customer<select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label><label>Product<select value={form.product} onChange={e=>setForm({...form,product:e.target.value,assetType:e.target.value==="home"?"property":"vehicle"})}><option value="auto">Auto</option><option value="home">Home / Property</option><option value="business">Commercial</option></select></label></div>
      <label>Insured asset<input placeholder={form.product==="auto"?"2025 Ford Mustang GT":"123 Main Street"} value={form.assetDescription} onChange={e=>setForm({...form,assetDescription:e.target.value})} required/></label>
      <div className="three-col"><label>Base monthly premium<input type="number" min="1" value={form.basePremium} onChange={e=>setForm({...form,basePremium:e.target.value})}/></label><label>Deductible<select value={form.deductible} onChange={e=>setForm({...form,deductible:e.target.value})}><option value="500">$500</option><option value="1000">$1,000</option><option value="2000">$2,000</option><option value="2500">$2,500</option></select></label><label>Estimated premium<input value={money(calculatedPremium(form))+" / month"} readOnly/></label></div>
      <div className="two-col"><label>Liability limit<input type="number" value={form.liabilityLimit} onChange={e=>setForm({...form,liabilityLimit:e.target.value})}/></label><label>Property damage limit<input type="number" value={form.propertyDamageLimit} onChange={e=>setForm({...form,propertyDamageLimit:e.target.value})}/></label></div>
      <label>Risk / underwriting notes<textarea rows="4" value={form.riskNotes} onChange={e=>setForm({...form,riskNotes:e.target.value})} placeholder="Loss history, special conditions, discounts, concerns…"/></label>
      <div className="premium-preview"><div><span>Estimated monthly premium</span><strong>{money(calculatedPremium(form))}</strong></div><div><span>Six-month premium</span><strong>{money(calculatedPremium(form)*6)}</strong></div></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Creating…":"Create quote"}</button></div>
    </form></div>}
  </section>
}
