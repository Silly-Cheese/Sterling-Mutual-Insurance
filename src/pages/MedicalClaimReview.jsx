import {useEffect,useMemo,useState} from "react";
import {collection,doc,getDocs,runTransaction,serverTimestamp,updateDoc} from "firebase/firestore";
import {ClipboardCheck,RefreshCw,ShieldCheck} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const displayStatus=s=>String(s||"submitted").replaceAll("_"," ");
const claimNo=()=>"CLM-MED-"+Date.now().toString(36).toUpperCase();

export default function MedicalClaimReview({staff,onNavigate}){
  const [requests,setRequests]=useState([]),[policies,setPolicies]=useState([]);
  const [selected,setSelected]=useState(null),[policyId,setPolicyId]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const canReview=can(staff,PERMISSIONS.CLAIM_UPDATE)||can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER);
  const canConvert=can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER);
  const byId=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,p])),[policies]);
  async function load(){
    setLoading(true);
    try{
      const [rs,ps]=await Promise.all([getDocs(collection(db,"medicalClaimRequests")),getDocs(collection(db,"policies"))]);
      setRequests(rs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setPolicies(ps.docs.map(d=>({id:d.id,...d.data()})));
      setError("");
    }catch(e){setError("Unable to load medical claims: "+(e?.message||"Access denied"))}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  function open(r){setSelected(r);setPolicyId(r.policyId||"");setNote(r.reviewNote||"");setError("")}
  async function mark(status){
    if(!selected||!canReview)return;
    setBusy(true);setError("");
    try{
      await updateDoc(doc(db,"medicalClaimRequests",selected.id),{
        status,reviewNote:note.trim().slice(0,1000),reviewedBy:staff.id,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      setSelected(null);await load();
    }catch(e){setError(e?.message||"Could not update the request.")}
    finally{setBusy(false)}
  }
  async function convert(){
    if(!selected||!canConvert)return;
    const policy=byId[policyId];
    if(!policy||!["active","renewal_pending","cancellation_pending"].includes(policy.status)){setError("Select an eligible Sterling policy before creating an official claim.");return}
    if(selected.customerId && selected.customerId!==policy.customerId){setError("The selected policy belongs to a different customer.");return}
    setBusy(true);setError("");
    try{
      const requestRef=doc(db,"medicalClaimRequests",selected.id);
      const claimRef=doc(collection(db,"claims"));
      const number=claimNo();
      await runTransaction(db,async tx=>{
        const current=await tx.get(requestRef);
        if(!current.exists()||current.data().status==="converted"||current.data().status==="declined")throw new Error("This request is already closed or converted.");
        const r=current.data();
        if(r.customerId&&r.customerId!==policy.customerId)throw new Error("Customer does not match the selected policy.");
        tx.set(claimRef,{
          claimNumber:number,medicalRequestId:selected.id,sourceSystem:r.sourceSystem,
          sourceInvoiceId:r.sourceInvoiceId,invoiceNumber:r.invoiceNumber,
          policyId:policy.id,policyNumber:policy.policyNumber,customerId:policy.customerId,customerName:policy.customerName||r.patientName,
          lossDate:r.serviceDate,lossType:"medical_expense",
          description:"Medical expense request: "+r.expenseCategory+" • "+r.providerName+" • Invoice "+r.invoiceNumber+(r.notes?" • "+r.notes:""),
          claimedAmount:r.amount,reportedBy:r.submitterRole,reportMethod:"medical_portal",priority:"normal",severity:"moderate",
          status:"open",stage:"intake",coverageStatus:"pending",liabilityStatus:"undetermined",
          reserveCategories:{property:0,bodilyInjury:0,rental:0,legal:0,other:0},reserveAmount:0,settlementAmount:0,
          siuStatus:"none",assignedTo:"",assignedName:"",createdBy:staff.id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
        tx.update(requestRef,{
          status:"converted",customerId:policy.customerId,policyId:policy.id,policyNumber:policy.policyNumber,
          claimId:claimRef.id,claimNumber:number,reviewNote:note.trim().slice(0,1000),
          reviewedBy:staff.id,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
      });
      setSelected(null);await load();
    }catch(e){setError(e?.message||"Unable to convert request to an official claim.")}
    finally{setBusy(false)}
  }
  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">MEDICAL CLAIMS INTAKE</div><h1>Medical payout requests</h1><p>Northstar and manual submissions arrive here. Verify identity, policy coverage, and invoicing before creating a standard Sterling claim. No payout occurs at intake.</p></div><button className="secondary compact" onClick={load}><RefreshCw size={16}/> Refresh</button></div>
    <div className="metric-grid"><article className="metric-card"><div className="metric-label">Awaiting review</div><div className="metric-value">{requests.filter(r=>r.status==="submitted").length}</div></article><article className="metric-card"><div className="metric-label">Needs information</div><div className="metric-value">{requests.filter(r=>r.status==="needs_info").length}</div></article><article className="metric-card"><div className="metric-label">Converted to claims</div><div className="metric-value">{requests.filter(r=>r.status==="converted").length}</div></article></div>
    {error&&<div className="medical-error" role="alert">{error}</div>}
    <div className="table-card"><div className="table-toolbar"><strong>Submitted medical bills</strong><span>{requests.length} requests</span></div>{loading?<div className="empty-state compact-empty">Loading…</div>:requests.length===0?<div className="empty-state compact-empty">No requests have been submitted.</div>:<div className="medical-request-list">{requests.map(r=><button key={r.id} className={"medical-intake-row "+(selected?.id===r.id?"selected":"")} onClick={()=>open(r)}><ClipboardCheck size={19}/><span><strong>{r.patientName} • {r.invoiceNumber}</strong><small>{r.providerName} · {r.submitterRole} · {r.policyNumber||"Coverage match needed"}</small></span><b>{money(r.amount)}</b><span className={"status-pill "+r.status}>{displayStatus(r.status)}</span></button>)}</div>}</div>
    {selected&&<div className="panel medical-review"><div className="eyebrow">SUBMISSION REVIEW</div><h2>{selected.patientName} · {selected.invoiceNumber}</h2><div className="medical-facts"><div><span>Provider</span><strong>{selected.providerName}</strong></div><div><span>Amount requested</span><strong>{money(selected.amount)}</strong></div><div><span>Service date</span><strong>{selected.serviceDate}</strong></div><div><span>Category</span><strong>{selected.expenseCategory}</strong></div><div><span>Source</span><strong>{selected.sourceSystem}</strong></div><div><span>Current status</span><strong>{displayStatus(selected.status)}</strong></div></div>{selected.notes&&<p>{selected.notes}</p>}
      {selected.claimId&&<p><ShieldCheck size={16}/> Official claim: <strong>{selected.claimNumber||selected.claimId}</strong> — continue payout processing in the Claims workspace.</p>}
      {selected.status!=="converted"&&selected.status!=="declined"&&canReview&&<>
        <label>Link confirmed Sterling policy<select value={policyId} onChange={e=>setPolicyId(e.target.value)}><option value="">Choose after verifying patient and coverage</option>{policies.filter(p=>["active","renewal_pending","cancellation_pending"].includes(p.status)&&(!selected.customerId||p.customerId===selected.customerId)).map(p=><option key={p.id} value={p.id}>{p.policyNumber} — {p.customerName}</option>)}</select></label>
        <label>Review note<textarea rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain missing documentation, verification, or denial."/></label>
        <div className="medical-actions">{canConvert&&<button className="primary" disabled={busy||!policyId} onClick={convert}>Create official claim</button>}<button className="secondary" disabled={busy||!note.trim()} onClick={()=>mark("needs_info")}>Request more information</button><button className="secondary" disabled={busy||!note.trim()} onClick={()=>mark("declined")}>Decline intake</button><button className="secondary" onClick={()=>setSelected(null)}>Close</button></div>
      </>}
      {selected.status==="converted"&&<button className="secondary" onClick={()=>onNavigate("Claims")}>Open claims management</button>}
    </div>}
  </section>;
}
