import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,getDocs,query,serverTimestamp,where} from "firebase/firestore";
import {FileHeart,LogOut,RefreshCw,Send,ShieldCheck} from "lucide-react";
import {db} from "../firebase";

const money = value => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value||0));
const initial = {policyId:"",policyNumber:"",patientName:"",providerName:"",invoiceNumber:"",sourceInvoiceId:"",serviceDate:"",expenseCategory:"hospital",amount:"",notes:"",sourceSystem:"manual"};
const categories = [["hospital","Hospital / emergency care"],["physician","Physician visit"],["medication","Medication"],["imaging","Imaging / diagnostic"],["procedure","Procedure"],["therapy","Therapy / rehabilitation"],["other","Other medical expense"]];
const stamp = value => value?.toDate?.()?.toLocaleDateString() || "Just submitted";

export function MedicalClaimPortal({user,customerAccount=null,providerAccount=null,policies=[]}){
  const mode = providerAccount ? "provider" : "customer";
  const isProvider = mode==="provider";
  const [form,setForm]=useState(initial);
  const [requests,setRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const eligible=useMemo(()=>policies.filter(p=>["active","renewal_pending","cancellation_pending"].includes(p.status)),[policies]);
  const update=(key,value)=>setForm(v=>({...v,[key]:value}));

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const invoice=params.get("medicalInvoice")||"";
    const amount=params.get("medicalAmount")||"";
    if(invoice && invoice.length<=100){
      const numeric=Number(amount);
      setForm(v=>({...v,invoiceNumber:invoice,sourceInvoiceId:invoice,
        amount:Number.isFinite(numeric)&&numeric>0?numeric.toFixed(2):"",
        serviceDate:params.get("medicalDate")||"",
        sourceSystem:params.get("medicalSource")==="northstar"?"northstar":"manual",
        providerName:isProvider?providerAccount.organizationName:(v.providerName||"Northstar Medical Center")}));
      window.history.replaceState(null,"",window.location.pathname+window.location.hash);
    }
  },[isProvider,providerAccount?.organizationName]);

  async function refresh(){
    setLoading(true);
    try{
      const field=isProvider?"submitterUid":"customerId";
      const uid=isProvider?user.uid:customerAccount?.customerId;
      const snap=await getDocs(query(collection(db,"medicalClaimRequests"),where(field,"==",uid)));
      setRequests(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setError("");
    }catch(e){setError("Unable to load medical requests: "+(e?.message||"Access denied"))}
    finally{setLoading(false)}
  }
  useEffect(()=>{refresh()},[user.uid,customerAccount?.customerId,isProvider]);

  async function submit(e){
    e.preventDefault();
    setBusy(true);setError("");setSuccess("");
    try{
      const amount=Number(form.amount);
      if(!Number.isFinite(amount)||amount<=0||amount>1000000)throw new Error("Enter a requested amount between $0.01 and $1,000,000.");
      if(form.patientName.trim().length<2 || !form.invoiceNumber.trim())throw new Error("Enter the patient and invoice reference.");
      const policy=eligible.find(p=>p.id===form.policyId);
      if(!isProvider && form.policyId && !policy)throw new Error("Select an eligible policy or leave the policy blank for staff review.");
      await addDoc(collection(db,"medicalClaimRequests"),{
        schemaVersion:1,submitterUid:user.uid,submitterRole:mode,
        customerId:isProvider?"":customerAccount.customerId,
        policyId:isProvider?"":(policy?.id||""),
        policyNumber:isProvider?form.policyNumber.trim():(policy?.policyNumber||""),
        patientName:form.patientName.trim(),
        providerName:isProvider?providerAccount.organizationName:form.providerName.trim(),
        invoiceNumber:form.invoiceNumber.trim(),
        sourceInvoiceId:form.sourceInvoiceId.trim(),
        serviceDate:form.serviceDate,
        expenseCategory:form.expenseCategory,
        amount:Math.round(amount*100)/100,
        notes:form.notes.trim(),
        sourceSystem:form.sourceSystem,
        status:"submitted",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      setSuccess("Your medical payout request has been submitted for review. No payout has been issued.");
      setForm({...initial,providerName:isProvider?providerAccount.organizationName:""});
      await refresh();
    }catch(e){setError(e?.message||"Could not submit the request.")}
    finally{setBusy(false)}
  }

  return <div className="medical-portal">
    <section className="medical-intro">
      <div className="eyebrow">MEDICAL CLAIMS • NORTHSTAR BRIDGE</div>
      <h2>Request payment for medical expenses</h2>
      <p>{isProvider?"Submit invoices for Sterling Mutual review on behalf of your patients.":"Submit a hospital, physician, pharmacy, or other medical bill for Sterling Mutual review."} Northstar invoice references can be prefilled from its Billing page, but the claim is filed and reviewed here in Sterling.</p>
      <div className="medical-disclosure"><ShieldCheck size={18}/><span>Roleplay only. Submitting a request does not verify coverage, authorize treatment, transfer clinical records, or send real money. A Sterling claims employee must review eligibility and issue any simulated payout.</span></div>
    </section>
    <div className="medical-grid">
      <form className="panel medical-form" onSubmit={submit}>
        <div className="eyebrow">NEW PAYOUT REQUEST</div>
        <h3>Medical expense details</h3>
        {!isProvider&&<label>Policy (optional)<select value={form.policyId} onChange={e=>update("policyId",e.target.value)}><option value="">Not sure / review my coverage</option>{eligible.map(p=><option value={p.id} key={p.id}>{p.policyNumber} • {p.product||"policy"}</option>)}</select></label>}
        {isProvider&&<><div className="medical-provider-name"><strong>Submitting practice</strong><span>{providerAccount.organizationName}</span></div><label>Patient's Sterling policy number (if known)<input maxLength={80} value={form.policyNumber} onChange={e=>update("policyNumber",e.target.value)} placeholder="Policy number for matching"/></label></>}
        <div className="medical-two">
          <label>Patient name<input maxLength={160} value={form.patientName} onChange={e=>update("patientName",e.target.value)} required/></label>
          {!isProvider&&<label>Medical provider<input maxLength={160} value={form.providerName} onChange={e=>update("providerName",e.target.value)} required placeholder="Hospital or provider name"/></label>}
          <label>Invoice number<input maxLength={100} value={form.invoiceNumber} onChange={e=>update("invoiceNumber",e.target.value)} required placeholder="NMC-... or invoice ID"/></label>
          <label>Date of service<input type="date" value={form.serviceDate} onChange={e=>update("serviceDate",e.target.value)} required/></label>
          <label>Expense category<select value={form.expenseCategory} onChange={e=>update("expenseCategory",e.target.value)}>{categories.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
          <label>Requested payout (USD)<input type="number" min="0.01" max="1000000" step="0.01" value={form.amount} onChange={e=>update("amount",e.target.value)} required/></label>
        </div>
        <label>Additional details (optional)<textarea maxLength={1000} rows={4} value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Describe the billed services without including sensitive medical details."/></label>
        {error&&<p role="alert" className="medical-error">{error}</p>}
        {success&&<p role="status" className="medical-success">{success}</p>}
        <button className="primary" disabled={busy}><Send size={16}/>{busy?"Submitting…":"Submit medical payout request"}</button>
      </form>
      <section className="table-card medical-history">
        <div className="table-toolbar"><strong>{isProvider?"Practice submissions":"My medical requests"}</strong><button className="secondary compact" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div>
        {loading?<div className="empty-state compact-empty">Loading requests…</div>:requests.length===0?<div className="empty-state compact-empty">No medical payout requests yet.</div>:<div className="medical-request-list">{requests.map(r=><article key={r.id}><div><strong>{r.invoiceNumber}</strong><span>{r.patientName} · {stamp(r.createdAt)}</span></div><div><b>{money(r.amount)}</b><span className={"status-pill "+r.status}>{String(r.status||"submitted").replaceAll("_"," ")}</span></div><small>{r.providerName} · {r.policyNumber||"Policy matching pending"}{r.claimNumber?" · Claim "+r.claimNumber:""}</small>{r.reviewNote&&<p>{r.reviewNote}</p>}</article>)}</div>}
      </section>
    </div>
  </div>;
}

export default function ProviderPortal({user,providerAccount,onSignOut}){
  return <div className="customer-portal-shell">
    <header className="customer-portal-header"><div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Medical Provider Portal</span></div></div><button className="secondary compact" onClick={onSignOut}><LogOut size={15}/> Sign out</button></header>
    <main className="customer-portal-main"><section className="customer-welcome"><div className="eyebrow">APPROVED PROVIDER ACCESS</div><h1>{providerAccount.organizationName}</h1><p>Medical expense submissions and claim-status tracking. Insurance decisions are made by Sterling Mutual staff.</p></section><MedicalClaimPortal user={user} providerAccount={providerAccount}/></main>
  </div>;
}
