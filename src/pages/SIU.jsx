import {useEffect,useState} from "react";
import {collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,CheckCircle2,ShieldAlert,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

export default function SIU({staff}){
  const [cases,setCases]=useState([]),[selected,setSelected]=useState(null),[score,setScore]=useState("50"),[notes,setNotes]=useState("");

  async function load(){
    const snap=await getDocs(collection(db,"siuCases"));
    setCases(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }
  useEffect(()=>{load().catch(()=>{})},[]);

  async function save(){
    if(!selected)return;
    const indicators=notes.trim()?notes.split("\n").map(x=>x.trim()).filter(Boolean):selected.indicators||[];
    await updateDoc(doc(db,"siuCases",selected.id),{riskScore:Number(score||0),indicators,updatedAt:serverTimestamp(),updatedBy:staff.id});
    setSelected(null);await load();
  }

  async function closeCase(result){
    if(!selected)return;
    await updateDoc(doc(db,"siuCases",selected.id),{status:"closed",result,closedAt:serverTimestamp(),closedBy:staff.id,updatedAt:serverTimestamp()});
    setSelected(null);await load();
  }

  function openCase(c){
    setSelected(c);setScore(String(c.riskScore||50));setNotes((c.indicators||[]).join("\n"));
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">SPECIAL INVESTIGATIONS UNIT</div><h1>SIU</h1><p>Review referred claims, document indicators, and record investigation outcomes.</p></div></div>
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><ShieldAlert size={19}/></div><div className="metric-value">{cases.filter(c=>c.status==="open").length}</div><div className="metric-label">Open SIU cases</div><div className="metric-sub">Active investigations</div></article>
      <article className="metric-card"><div className="metric-icon"><AlertTriangle size={19}/></div><div className="metric-value">{cases.filter(c=>Number(c.riskScore)>=70&&c.status==="open").length}</div><div className="metric-label">High-risk reviews</div><div className="metric-sub">Score 70 or higher</div></article>
      <article className="metric-card"><div className="metric-icon"><CheckCircle2 size={19}/></div><div className="metric-value">{cases.filter(c=>c.status==="closed").length}</div><div className="metric-label">Closed cases</div><div className="metric-sub">Investigation complete</div></article>
      <article className="metric-card"><div className="metric-icon"><ShieldAlert size={19}/></div><div className="metric-value">{cases.length}</div><div className="metric-label">Total referrals</div><div className="metric-sub">All-time SIU intake</div></article>
    </div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Investigation queue</strong><span>{cases.length} cases</span></div>
      {cases.length===0?<div className="empty-state"><ShieldAlert size={30}/><h3>No SIU cases.</h3><p>Claims referred by authorized staff will appear here.</p></div>:
      <div className="quote-list">{cases.map(c=><button className="policy-row" key={c.id} onClick={()=>openCase(c)}>
        <div className="product-icon"><AlertTriangle size={18}/></div>
        <div className="quote-main"><strong>{c.customerName}</strong><span>{c.claimNumber} • Special investigation</span></div>
        <div className="quote-money"><strong>{c.riskScore||0}% risk</strong><span>{(c.indicators||[]).length} indicators</span></div>
        <span className={"status-pill "+c.status}>{c.status}</span>
      </button>)}</div>}
    </div>

    {selected&&<div className="modal-backdrop"><div className="modal wide">
      <div className="modal-head"><div><div className="eyebrow">SIU CASE</div><h2>{selected.claimNumber}</h2></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="policy-hero"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Status</span><strong>{selected.status}</strong></div><div><span>Risk score</span><strong>{score}%</strong></div></div>
      <label>Investigation risk score<input type="number" min="0" max="100" value={score} onChange={e=>setScore(e.target.value)} disabled={!can(staff,PERMISSIONS.SIU_MANAGE)}/></label>
      <label>Indicators / investigation notes<textarea rows="8" value={notes} onChange={e=>setNotes(e.target.value)} disabled={!can(staff,PERMISSIONS.SIU_MANAGE)} placeholder="One indicator or note per line"/></label>
      <div className="notice-box">The risk score is an RP investigation aid only. It does not automatically determine fraud or coverage.</div>
      <div className="modal-actions">
        {can(staff,PERMISSIONS.SIU_MANAGE)&&selected.status==="open"&&<><button className="secondary" onClick={()=>closeCase("no_adverse_finding")}>Close — no adverse finding</button><button className="secondary danger-soft" onClick={()=>closeCase("refer_to_claims")}>Close — refer findings to claims</button><button className="primary" onClick={save}>Save investigation</button></>}
        <button className="secondary" onClick={()=>setSelected(null)}>Close</button>
      </div>
    </div></div>}
  </section>
}
