import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDoc,getDocs,query,serverTimestamp,where} from "firebase/firestore";
import {Bell,CreditCard,FileCheck2,FileText,LogOut,Send,ShieldAlert} from "lucide-react";
import {db} from "../firebase";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));

export default function CustomerPortal({user,customerAccount,onSignOut}){
  const [customer,setCustomer]=useState(null),[policies,setPolicies]=useState([]),[claims,setClaims]=useState([]),[billing,setBilling]=useState([]),[documents,setDocuments]=useState([]),[requests,setRequests]=useState([]),[loading,setLoading]=useState(true),[request,setRequest]=useState({type:"proof_of_insurance",details:""}),[sending,setSending]=useState(false),[tab,setTab]=useState("overview");

  async function load(){
    const customerId=customerAccount.customerId;
    const safe=async(name)=>{try{const s=await getDocs(query(collection(db,name),where("customerId","==",customerId)));return s.docs.map(d=>({id:d.id,...d.data()}))}catch{return []}};
    const [cSnap,p,cl,b,d,r]=await Promise.all([getDoc(doc(db,"customers",customerId)),safe("policies"),safe("claims"),safe("billingTransactions"),safe("documents"),safe("serviceRequests")]);
    if(cSnap.exists())setCustomer({id:cSnap.id,...cSnap.data()});setPolicies(p);setClaims(cl);setBilling(b);setDocuments(d);setRequests(r.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setLoading(false);
  }
  useEffect(()=>{load().catch(()=>setLoading(false))},[customerAccount.customerId]);

  const balance=useMemo(()=>billing.reduce((sum,t)=>sum+(t.type==="charge"?Number(t.amount||0):["payment","credit","refund"].includes(t.type)?-Number(t.amount||0):0),0),[billing]);

  async function submitRequest(e){
    e.preventDefault();setSending(true);
    try{
      await addDoc(collection(db,"serviceRequests"),{customerId:customerAccount.customerId,customerName:customer?.displayName||customerAccount.displayName,type:request.type,details:request.details,status:"submitted",submittedBy:user.uid,submittedByEmail:user.email,createdAt:serverTimestamp()});
      setRequest({type:"proof_of_insurance",details:""});await load();
    }finally{setSending(false)}
  }

  if(loading)return <div className="splash"><div className="brand-mark large">SM</div><span>Opening your account…</span></div>;
  const tabs=[["overview","Overview"],["policies","Policies"],["claims","Claims"],["billing","Billing"],["documents","Documents"],["requests","Requests"]];

  return <div className="customer-portal-shell">
    <header className="customer-portal-header"><div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Customer Account</span></div></div><button className="secondary compact" onClick={onSignOut}><LogOut size={15}/> Sign out</button></header>
    <main className="customer-portal-main">
      <section className="customer-welcome"><div className="eyebrow">MY STERLING MUTUAL</div><h1>Welcome, {customer?.firstName||customer?.displayName||user.displayName||"Customer"}.</h1><p>Your coverage, claims, billing, documents, and service requests in one place.</p></section>
      <div className="record-summary customer-account-summary"><div><span>Customer</span><strong>{customer?.displayName||customerAccount.displayName}</strong></div><div><span>Active policies</span><strong>{policies.filter(p=>p.status==="active").length}</strong></div><div><span>Open claims</span><strong>{claims.filter(c=>!["closed","denied"].includes(c.status)).length}</strong></div><div><span>Billing balance</span><strong>{money(balance)}</strong></div></div>
      <div className="record-tabs customer-portal-tabs">{tabs.map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div>

      {tab==="overview"&&<div className="customer-portal-grid"><section className="table-card"><div className="table-toolbar"><strong>Current coverage</strong><span>{policies.length}</span></div><div className="portal-record-list">{policies.slice(0,4).map(p=><div key={p.id}><FileCheck2 size={18}/><div><strong>{p.policyNumber}</strong><span>{p.product?.toUpperCase()} • {p.status}</span></div><div><strong>{money(p.monthlyPremium)}/mo</strong></div></div>)}</div></section><section className="table-card"><div className="table-toolbar"><strong>Service requests</strong><span>{requests.length}</span></div>{requests.length===0?<div className="empty-state compact-empty"><Bell size={25}/><h3>No requests yet.</h3></div>:<div className="portal-record-list">{requests.slice(0,4).map(r=><div key={r.id}><Bell size={18}/><div><strong>{String(r.type).replaceAll("_"," ")}</strong><span>{r.status}</span></div></div>)}</div>}</section></div>}
      {tab==="policies"&&<PortalList items={policies} empty="No policies yet." render={p=><><FileCheck2 size={18}/><div><strong>{p.policyNumber}</strong><span>{p.product?.toUpperCase()} • {p.status}</span></div><div><strong>{money(p.monthlyPremium)}/mo</strong><span>{p.effectiveDate} → {p.expirationDate}</span></div></>}/>}
      {tab==="claims"&&<PortalList items={claims} empty="No claims on file." render={c=><><ShieldAlert size={18}/><div><strong>{c.claimNumber}</strong><span>{c.lossType} • {c.status}</span></div><div><strong>{money(c.claimedAmount)}</strong><span>Coverage: {c.coverageStatus}</span></div></>}/>}
      {tab==="billing"&&<PortalList items={billing} empty="No billing history yet." render={t=><><CreditCard size={18}/><div><strong>{t.type}</strong><span>{t.policyNumber} • {t.note||"No note"}</span></div><div><strong>{money(t.amount)}</strong></div></>}/>}
      {tab==="documents"&&<PortalList items={documents} empty="No documents available." render={d=><><FileText size={18}/><div><strong>{d.title||d.type||"Document"}</strong><span>{d.policyNumber||"Customer document"} • {d.status||"available"}</span></div></>}/>}
      {tab==="requests"&&<div className="portal-request-grid"><form className="panel service-request-form" onSubmit={submitRequest}><div className="eyebrow">REQUEST SERVICE</div><h2>How can we help?</h2><label>Request type<select value={request.type} onChange={e=>setRequest({...request,type:e.target.value})}><option value="proof_of_insurance">Proof of insurance</option><option value="add_vehicle">Add vehicle</option><option value="remove_vehicle">Remove vehicle</option><option value="change_address">Change address</option><option value="policy_change">Policy change</option><option value="billing_question">Billing question</option><option value="claim_question">Claim question</option><option value="other">Other</option></select></label><label>Details<textarea rows="5" value={request.details} onChange={e=>setRequest({...request,details:e.target.value})} required/></label><button className="primary" disabled={sending}><Send size={15}/>{sending?"Sending…":"Submit request"}</button></form><div className="table-card"><div className="table-toolbar"><strong>My requests</strong><span>{requests.length}</span></div><div className="portal-record-list">{requests.map(r=><div key={r.id}><Bell size={18}/><div><strong>{String(r.type).replaceAll("_"," ")}</strong><span>{r.details}</span></div><div><span className={"status-pill "+r.status}>{r.status}</span></div></div>)}</div></div></div>}
    </main>
  </div>
}

function PortalList({items,empty,render}){return <section className="table-card"><div className="table-toolbar"><strong>Records</strong><span>{items.length}</span></div>{items.length===0?<div className="empty-state compact-empty">{empty}</div>:<div className="portal-record-list">{items.map(i=><div key={i.id}>{render(i)}</div>)}</div>}</section>}
