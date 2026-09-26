import {useEffect,useMemo,useState} from "react";
import {collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,CheckCircle2,Clock3,FileText,RefreshCw,ShieldX} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const today=()=>new Date().toISOString().slice(0,10);
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));

export default function Cancellations({staff,onNavigate}){
  const [cases,setCases]=useState([]),[policies,setPolicies]=useState([]),[invoices,setInvoices]=useState([]),[documents,setDocuments]=useState([]),[filter,setFilter]=useState("open");
  async function safe(n){try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}}
  async function load(){
    const [c,p,i,d]=await Promise.all(["policyCancellations","policies","billingInvoices","documents"].map(safe));
    setCases(c.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setPolicies(p);setInvoices(i);setDocuments(d);
  }
  useEffect(()=>{load().catch(()=>{})},[]);

  const policyMap=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,p])),[policies]);
  const visible=cases.filter(c=>filter==="all"||filter==="open"?filter==="all":c.status==="open"||filter==="rescinded"&&c.status==="rescinded"||filter==="completed"&&c.status==="completed");
  function balanceDue(c){return invoices.filter(i=>i.policyId===c.policyId&&!["paid","void"].includes(i.status)).reduce((s,i)=>s+Number(i.balanceDue??i.amount??0),0)}
  function daysUntil(date){if(!date)return null;return Math.ceil((new Date(date+"T23:59:59")-new Date())/86400000)}

  async function advance(c,stage){
    const p=policyMap[c.policyId];if(!p)return;
    if(stage==="notice_sent"){
      await updateDoc(doc(db,"policyCancellations",c.id),{stage,noticeSentAt:serverTimestamp(),noticeSentBy:staff.id});
      await updateDoc(doc(db,"policies",p.id),{cancellationStage:stage,updatedAt:serverTimestamp()});
    }
    if(stage==="pending_effective"){
      await updateDoc(doc(db,"policyCancellations",c.id),{stage,updatedAt:serverTimestamp(),updatedBy:staff.id});
      await updateDoc(doc(db,"policies",p.id),{cancellationStage:stage,updatedAt:serverTimestamp()});
    }
    if(stage==="cancelled"){
      await updateDoc(doc(db,"policyCancellations",c.id),{stage,status:"completed",finalizedAt:serverTimestamp(),finalizedBy:staff.id});
      await updateDoc(doc(db,"policies",p.id),{status:"cancelled",cancellationStage:"cancelled",cancelledAt:serverTimestamp(),cancelledBy:staff.id,updatedAt:serverTimestamp()});
    }
    await load();
  }
  async function rescind(c){
    const p=policyMap[c.policyId];if(!p)return;
    await updateDoc(doc(db,"policyCancellations",c.id),{status:"rescinded",stage:"rescinded",rescindedAt:serverTimestamp(),rescindedBy:staff.id});
    await updateDoc(doc(db,"policies",p.id),{status:"active",cancellationCaseId:null,cancellationStage:null,cancellationEffectiveDate:null,cancellationReason:null,billingStatus:p.billingStatus==="cancellation_pending"?"current":p.billingStatus,updatedAt:serverTimestamp()});
    await load();
  }
  async function reinstate(c){
    const p=policyMap[c.policyId];if(!p)return;
    await updateDoc(doc(db,"policies",p.id),{status:"active",reinstatedAt:serverTimestamp(),reinstatedBy:staff.id,cancellationStage:null,coverageLapse:{from:c.effectiveDate||p.cancellationEffectiveDate||"unknown",to:new Date().toISOString().slice(0,10)},updatedAt:serverTimestamp()});
    await updateDoc(doc(db,"policyCancellations",c.id),{reinstated:true,reinstatedAt:serverTimestamp(),reinstatedBy:staff.id});
    await load();
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">POLICY SERVICE</div><h1>Cancellation Center</h1><p>One place for notices, pending effective dates, rescissions, completed cancellations, and reinstatement review.</p></div></div>
    <div className="metric-grid"><article className="metric-card"><div className="metric-value">{cases.filter(c=>c.status==="open").length}</div><div className="metric-label">Open cases</div></article><article className="metric-card"><div className="metric-value">{cases.filter(c=>c.stage==="pending_effective").length}</div><div className="metric-label">Pending effective</div></article><article className="metric-card"><div className="metric-value">{cases.filter(c=>c.status==="rescinded").length}</div><div className="metric-label">Rescinded</div></article><article className="metric-card"><div className="metric-value">{cases.filter(c=>c.status==="completed").length}</div><div className="metric-label">Completed</div></article></div>
    <div className="cancellation-filters">{["open","completed","rescinded","all"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <div className="table-card"><div className="table-toolbar"><strong>Cancellation cases</strong><span>{visible.length}</span></div>{visible.length===0?<div className="empty-state"><CheckCircle2 size={30}/><h3>No cases in this view.</h3></div>:<div className="cancellation-case-list">{visible.map(c=>{const p=policyMap[c.policyId]||{};const due=balanceDue(c),days=daysUntil(c.effectiveDate),docs=documents.filter(d=>d.policyId===c.policyId&&String(d.type).includes("cancellation"));return <article key={c.id} className={"cancellation-case "+(c.status==="open"?"open":"")}><div className="cancellation-case-top"><div><span className="eyebrow">{c.source==="billing"?"BILLING-INITIATED":"POLICY SERVICE"}</span><h3>{c.customerName}</h3><p>{c.policyNumber} • {(c.reasonCategory||"other").replaceAll("_"," ")}</p></div><span className={"status-pill "+c.stage}>{String(c.stage).replaceAll("_"," ")}</span></div><div className="cancellation-case-kpis"><div><span>Effective</span><strong>{c.effectiveDate||"—"}</strong></div><div><span>Countdown</span><strong>{days===null?"—":days<0?Math.abs(days)+" days past":days+" days"}</strong></div><div><span>Amount to cure</span><strong>{money(due)}</strong></div><div><span>Documents</span><strong>{docs.length}</strong></div></div><p className="cancellation-reason">{c.reason}</p><div className="cancellation-actions"><button className="secondary compact" onClick={()=>onNavigate?.("Policies",{customerId:c.customerId})}>Open policy</button><button className="secondary compact" onClick={()=>onNavigate?.("Billing",{policyId:c.policyId})}>Billing account</button>{c.status==="open"&&can(staff,PERMISSIONS.POLICY_CANCEL)&&c.stage==="notice_pending"&&<button className="primary compact" onClick={()=>advance(c,"notice_sent")}>Issue notice</button>}{c.status==="open"&&can(staff,PERMISSIONS.POLICY_CANCEL)&&c.stage==="notice_sent"&&<button className="primary compact" onClick={()=>advance(c,"pending_effective")}>Pending effective</button>}{c.status==="open"&&can(staff,PERMISSIONS.POLICY_CANCEL)&&<button className="secondary compact" onClick={()=>rescind(c)}>Rescind</button>}{c.status==="open"&&c.stage==="pending_effective"&&can(staff,PERMISSIONS.POLICY_CANCEL)&&<button className="secondary compact danger-soft" onClick={()=>advance(c,"cancelled")}>Finalize</button>}{c.status==="completed"&&can(staff,PERMISSIONS.POLICY_CANCEL)&&!c.reinstated&&<button className="primary compact" onClick={()=>reinstate(c)}><RefreshCw size={14}/> Reinstate</button>}</div></article>})}</div>}</div>
  </section>
}
