import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {AlertTriangle,ArrowRight,CheckCircle2,ClipboardCheck,Clock3,FileSearch,FolderOpen,Search,ShieldAlert,UserCheck,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const ageDays=ts=>ts?.toDate?Math.max(0,Math.floor((Date.now()-ts.toDate().getTime())/86400000)):0;

export default function SIU({staff,onNavigate}){
  const [cases,setCases]=useState([]),[claims,setClaims]=useState([]),[staffList,setStaffList]=useState([]),[indicators,setIndicators]=useState([]),[evidence,setEvidence]=useState([]),[actions,setActions]=useState([]),[findings,setFindings]=useState([]),[selected,setSelected]=useState(null),[tab,setTab]=useState("overview"),[filter,setFilter]=useState("open");
  const [indicator,setIndicator]=useState({category:"inconsistency",severity:"moderate",description:""});
  const [evidenceForm,setEvidenceForm]=useState({type:"document",title:"",source:"",notes:""});
  const [action,setAction]=useState({type:"records_review",summary:"",outcome:""});
  const [finding,setFinding]=useState({classification:"inconclusive",summary:"",recommendedAction:"continue_claim_review"});
  const [triage,setTriage]=useState({priority:"normal",assignedTo:"",riskScore:"50"});

  async function safe(n){try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}}
  async function load(){
    const [c,cl,s,i,e,a,f]=await Promise.all(["siuCases","claims","staff","siuIndicators","siuEvidence","siuActions","siuFindings"].map(safe));
    setCases(c.sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));setClaims(cl);setStaffList(s.filter(x=>x.status==="active"));setIndicators(i);setEvidence(e);setActions(a);setFindings(f);
    if(selected){const fresh=c.find(x=>x.id===selected.id);if(fresh)setSelected(fresh)}
  }
  useEffect(()=>{load().catch(()=>{})},[]);

  const claimMap=useMemo(()=>Object.fromEntries(claims.map(c=>[c.id,c])),[claims]);
  const shown=cases.filter(c=>filter==="all"||filter==="open"?filter==="all":c.status==="open"||filter==="assigned"&&c.assignedTo===staff.id&&c.status==="open"||filter==="supervisor"&&c.stage==="supervisor_review"||filter==="closed"&&c.status==="closed");
  const caseIndicators=selected?indicators.filter(x=>x.siuCaseId===selected.id):[];
  const caseEvidence=selected?evidence.filter(x=>x.siuCaseId===selected.id):[];
  const caseActions=selected?actions.filter(x=>x.siuCaseId===selected.id).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)):[];
  const caseFindings=selected?findings.filter(x=>x.siuCaseId===selected.id).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)):[];
  const claim=selected?claimMap[selected.claimId]:null;

  function openCase(c){
    setSelected(c);setTab("overview");setTriage({priority:c.priority||"normal",assignedTo:c.assignedTo||"",riskScore:String(c.riskScore??50)});
  }

  async function saveTriage(){
    if(!selected)return;
    const assignee=staffList.find(s=>s.id===triage.assignedTo);
    await updateDoc(doc(db,"siuCases",selected.id),{priority:triage.priority,assignedTo:triage.assignedTo,assignedName:assignee?.displayName||"",riskScore:Number(triage.riskScore||0),stage:triage.assignedTo?"investigation":"triage",updatedAt:serverTimestamp(),updatedBy:staff.id});
    await addDoc(collection(db,"siuActions"),{siuCaseId:selected.id,claimId:selected.claimId,type:"triage",summary:"SIU triage updated",outcome:(assignee?"Assigned to "+assignee.displayName:"Unassigned")+" • "+triage.priority+" priority",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await load();
  }

  async function addIndicator(){
    if(!selected||!indicator.description.trim())return;
    await addDoc(collection(db,"siuIndicators"),{siuCaseId:selected.id,claimId:selected.claimId,...indicator,status:"open",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"siuCases",selected.id),{stage:"investigation",updatedAt:serverTimestamp(),updatedBy:staff.id});
    setIndicator({category:"inconsistency",severity:"moderate",description:""});await load();
  }

  async function resolveIndicator(i,status){
    await updateDoc(doc(db,"siuIndicators",i.id),{status,resolvedAt:serverTimestamp(),resolvedBy:staff.id});
    await load();
  }

  async function addEvidence(){
    if(!selected||!evidenceForm.title.trim())return;
    await addDoc(collection(db,"siuEvidence"),{siuCaseId:selected.id,claimId:selected.claimId,...evidenceForm,status:"logged",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"siuActions"),{siuCaseId:selected.id,claimId:selected.claimId,type:"evidence_logged",summary:"Evidence logged: "+evidenceForm.title,outcome:evidenceForm.source||"",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    setEvidenceForm({type:"document",title:"",source:"",notes:""});await load();
  }

  async function addAction(){
    if(!selected||!action.summary.trim())return;
    await addDoc(collection(db,"siuActions"),{siuCaseId:selected.id,claimId:selected.claimId,...action,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"siuCases",selected.id),{stage:"investigation",lastActionAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:staff.id});
    setAction({type:"records_review",summary:"",outcome:""});await load();
  }

  async function submitFinding(){
    if(!selected||!finding.summary.trim())return;
    const adverse=["material_inconsistency","supported_concern"].includes(finding.classification);
    const ref=await addDoc(collection(db,"siuFindings"),{siuCaseId:selected.id,claimId:selected.claimId,claimNumber:selected.claimNumber,...finding,status:adverse&&!can(staff,PERMISSIONS.SIU_SUPERVISE)?"pending_supervisor":"final",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    if(adverse&&!can(staff,PERMISSIONS.SIU_SUPERVISE)){
      await updateDoc(doc(db,"siuCases",selected.id),{stage:"supervisor_review",pendingFindingId:ref.id,updatedAt:serverTimestamp(),updatedBy:staff.id});
      await addDoc(collection(db,"approvals"),{actionType:"siu_adverse_finding",title:"SIU adverse finding review",summary:selected.claimNumber+" • "+finding.classification.replaceAll("_"," "),recordId:selected.id,findingId:ref.id,claimId:selected.claimId,customerId:selected.customerId,status:"pending",requestedBy:staff.id,requestedByName:staff.displayName,createdAt:serverTimestamp()});
    }else{
      await updateDoc(doc(db,"siuCases",selected.id),{stage:"analysis",latestFindingId:ref.id,updatedAt:serverTimestamp(),updatedBy:staff.id});
    }
    setFinding({classification:"inconclusive",summary:"",recommendedAction:"continue_claim_review"});await load();
  }

  async function finalizeCase(result,summary){
    if(!selected)return;
    await updateDoc(doc(db,"siuCases",selected.id),{status:"closed",stage:"completed",result,closingSummary:summary||"",closedAt:serverTimestamp(),closedBy:staff.id,closedByName:staff.displayName,updatedAt:serverTimestamp()});
    if(selected.claimId){
      await updateDoc(doc(db,"claims",selected.claimId),{siuStatus:"completed",siuResult:result,siuCompletedAt:serverTimestamp(),siuCaseId:selected.id,updatedAt:serverTimestamp()});
      await addDoc(collection(db,"claimEvents"),{claimId:selected.claimId,type:"siu.completed",summary:"SIU investigation completed: "+result.replaceAll("_"," "),details:{siuCaseId:selected.id,closingSummary:summary||""},actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
    }
    setSelected(null);await load();
  }

  const openCount=cases.filter(c=>c.status==="open").length;
  const assignedMine=cases.filter(c=>c.status==="open"&&c.assignedTo===staff.id).length;
  const supervisor=cases.filter(c=>c.stage==="supervisor_review").length;
  const aging=cases.filter(c=>c.status==="open"&&ageDays(c.createdAt)>=7).length;

  return <section className="content">
    <div className="workflow-ribbon service-ribbon"><span>Referral</span><strong>Triage</strong><span>Investigation</span><span>Evidence</span><span>Analysis</span><span>Supervisor Review</span><span>Claims Handoff</span></div>
    <div className="page-heading"><div><div className="eyebrow">SPECIAL INVESTIGATIONS UNIT</div><h1>SIU</h1><p>Structured investigation cases with triage, indicators, evidence, investigative activity, findings, and formal claims handoff.</p></div></div>
    <div className="metric-grid"><article className="metric-card"><div className="metric-value">{openCount}</div><div className="metric-label">Open investigations</div></article><article className="metric-card"><div className="metric-value">{assignedMine}</div><div className="metric-label">Assigned to me</div></article><article className="metric-card"><div className="metric-value">{supervisor}</div><div className="metric-label">Supervisor review</div></article><article className="metric-card"><div className="metric-value">{aging}</div><div className="metric-label">Open 7+ days</div></article></div>

    <div className="work-filters">{["open","assigned","supervisor","closed","all"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <div className="table-card"><div className="table-toolbar"><strong>Investigation queue</strong><span>{shown.length} cases</span></div>{shown.length===0?<div className="empty-state"><ShieldAlert size={30}/><h3>No SIU cases in this view.</h3></div>:<div className="siu-case-list">{shown.map(c=><button key={c.id} onClick={()=>openCase(c)} className={ageDays(c.createdAt)>=7&&c.status==="open"?"aging":""}><div className="product-icon"><ShieldAlert size={18}/></div><div><strong>{c.customerName}</strong><span>{c.claimNumber} • {(c.referralReason||"Special investigation").slice(0,80)}</span><small>{c.assignedName||"Unassigned"} • {ageDays(c.createdAt)} days open</small></div><div><strong>{c.riskScore??50}</strong><span>risk aid</span></div><span className={"status-pill "+(c.stage||c.status)}>{String(c.stage||c.status).replaceAll("_"," ")}</span></button>)}</div>}</div>

    {selected&&<div className="modal-backdrop"><div className="modal claim-detail siu-detail"><div className="modal-head"><div><div className="eyebrow">SIU INVESTIGATION</div><h2>{selected.claimNumber}</h2><p>{selected.customerName} • {selected.referralReason||"Claim referral"}</p></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="siu-command-header"><div><span>Stage</span><strong>{String(selected.stage||selected.status).replaceAll("_"," ")}</strong></div><div><span>Priority</span><strong>{selected.priority||"normal"}</strong></div><div><span>Investigator</span><strong>{selected.assignedName||"Unassigned"}</strong></div><div><span>Risk aid</span><strong>{selected.riskScore??50}/100</strong></div><div><span>Indicators</span><strong>{caseIndicators.length}</strong></div><div><span>Evidence</span><strong>{caseEvidence.length}</strong></div></div>
      <div className="record-tabs">{[["overview","Overview"],["indicators","Indicators"],["evidence","Evidence"],["actions","Actions"],["findings","Findings"],["timeline","Timeline"]].map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div>

      {tab==="overview"&&<div className="siu-overview-grid"><article className="panel"><div className="eyebrow">REFERRAL</div><h3>{selected.referralType?.replaceAll("_"," ")||"Claim concern"}</h3><p>{selected.referralReason||"Manual referral from Claims."}</p><div className="record-summary"><div><span>Claim severity</span><strong>{claim?.severity||"—"}</strong></div><div><span>Claimed amount</span><strong>{claim?.claimedAmount??"—"}</strong></div><div><span>Coverage</span><strong>{claim?.coverageStatus||"—"}</strong></div><div><span>SIU status</span><strong>{claim?.siuStatus||"—"}</strong></div></div>{onNavigate&&<button className="secondary compact" onClick={()=>onNavigate("Claims",{customerId:selected.customerId})}>Open claim <ArrowRight size={14}/></button>}</article><article className="panel"><div className="eyebrow">TRIAGE</div><h3>Investigation ownership</h3><label>Priority<select value={triage.priority} onChange={e=>setTriage({...triage,priority:e.target.value})} disabled={!can(staff,PERMISSIONS.SIU_ASSIGN)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Investigator<select value={triage.assignedTo} onChange={e=>setTriage({...triage,assignedTo:e.target.value})} disabled={!can(staff,PERMISSIONS.SIU_ASSIGN)}><option value="">Unassigned</option>{staffList.filter(s=>can(s,PERMISSIONS.SIU_READ)||s.role==="siuInvestigator").map(s=><option key={s.id} value={s.id}>{s.displayName} — {s.title}</option>)}</select></label><label>Risk aid<input type="number" min="0" max="100" value={triage.riskScore} onChange={e=>setTriage({...triage,riskScore:e.target.value})} disabled={!can(staff,PERMISSIONS.SIU_MANAGE)}/></label>{(can(staff,PERMISSIONS.SIU_ASSIGN)||can(staff,PERMISSIONS.SIU_MANAGE))&&<button className="primary compact" onClick={saveTriage}>Save triage</button>}<div className="notice-box">The risk score is an investigative aid only. It does not determine fraud, liability, or coverage.</div></article></div>}

      {tab==="indicators"&&<div className="siu-two-col"><div className="panel"><div className="eyebrow">INDICATOR LOG</div><h3>Add investigation indicator</h3><div className="two-col"><label>Category<select value={indicator.category} onChange={e=>setIndicator({...indicator,category:e.target.value})}><option value="inconsistency">Inconsistency</option><option value="timeline">Timeline issue</option><option value="documentation">Documentation issue</option><option value="prior_history">Prior history</option><option value="identity">Identity concern</option><option value="financial">Financial indicator</option><option value="staged_loss">Staged-loss indicator</option><option value="other">Other</option></select></label><label>Severity<select value={indicator.severity} onChange={e=>setIndicator({...indicator,severity:e.target.value})}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label></div><label>Description<textarea rows="4" value={indicator.description} onChange={e=>setIndicator({...indicator,description:e.target.value})}/></label>{can(staff,PERMISSIONS.SIU_MANAGE)&&<button className="primary" onClick={addIndicator}>Add indicator</button>}</div><div className="table-card"><div className="table-toolbar"><strong>Indicators</strong><span>{caseIndicators.length}</span></div><div className="siu-item-list">{caseIndicators.map(i=><div key={i.id}><AlertTriangle size={16}/><div><strong>{i.category.replaceAll("_"," ")} • {i.severity}</strong><span>{i.description}</span><small>{i.status}</small></div>{can(staff,PERMISSIONS.SIU_MANAGE)&&i.status==="open"&&<div><button className="secondary compact" onClick={()=>resolveIndicator(i,"explained")}>Explained</button><button className="secondary compact" onClick={()=>resolveIndicator(i,"supported")}>Supported</button></div>}</div>)}</div></div></div>}

      {tab==="evidence"&&<div className="siu-two-col"><div className="panel"><div className="eyebrow">EVIDENCE LOG</div><h3>Record evidence</h3><label>Type<select value={evidenceForm.type} onChange={e=>setEvidenceForm({...evidenceForm,type:e.target.value})}><option value="document">Document</option><option value="photo">Photo / image</option><option value="statement">Statement</option><option value="record">External record</option><option value="digital">Digital evidence</option><option value="other">Other</option></select></label><label>Title<input value={evidenceForm.title} onChange={e=>setEvidenceForm({...evidenceForm,title:e.target.value})}/></label><label>Source<input value={evidenceForm.source} onChange={e=>setEvidenceForm({...evidenceForm,source:e.target.value})}/></label><label>Notes<textarea rows="4" value={evidenceForm.notes} onChange={e=>setEvidenceForm({...evidenceForm,notes:e.target.value})}/></label>{can(staff,PERMISSIONS.SIU_EVIDENCE)&&<button className="primary" onClick={addEvidence}>Log evidence</button>}</div><div className="table-card"><div className="table-toolbar"><strong>Evidence register</strong><span>{caseEvidence.length}</span></div><div className="siu-item-list">{caseEvidence.map(e=><div key={e.id}><FolderOpen size={16}/><div><strong>{e.title}</strong><span>{e.type} • {e.source||"No source listed"}</span><small>{e.notes||"No notes"}</small></div></div>)}</div></div></div>}

      {tab==="actions"&&<div className="siu-two-col"><div className="panel"><div className="eyebrow">INVESTIGATIVE ACTION</div><h3>Record activity</h3><label>Action type<select value={action.type} onChange={e=>setAction({...action,type:e.target.value})}><option value="records_review">Records review</option><option value="interview">Interview</option><option value="scene_review">Scene review</option><option value="vendor_contact">Vendor contact</option><option value="database_check">Database check</option><option value="claims_history_review">Claims history review</option><option value="document_comparison">Document comparison</option><option value="other">Other</option></select></label><label>Action summary<textarea rows="3" value={action.summary} onChange={e=>setAction({...action,summary:e.target.value})}/></label><label>Outcome<textarea rows="3" value={action.outcome} onChange={e=>setAction({...action,outcome:e.target.value})}/></label>{can(staff,PERMISSIONS.SIU_MANAGE)&&<button className="primary" onClick={addAction}>Record action</button>}</div><div className="table-card"><div className="table-toolbar"><strong>Investigation activity</strong><span>{caseActions.length}</span></div><div className="timeline">{caseActions.map(a=><div key={a.id}><span className="timeline-dot"></span><div><strong>{a.summary}</strong><p>{a.type.replaceAll("_"," ")}{a.outcome?" • "+a.outcome:""}</p><small>{a.createdByName||"Staff"} • {a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div></div></div>}

      {tab==="findings"&&<div className="siu-two-col"><div className="panel"><div className="eyebrow">CASE ANALYSIS</div><h3>Document finding</h3><label>Classification<select value={finding.classification} onChange={e=>setFinding({...finding,classification:e.target.value})}><option value="no_adverse_finding">No adverse finding</option><option value="inconclusive">Inconclusive</option><option value="material_inconsistency">Material inconsistency</option><option value="supported_concern">Supported concern</option></select></label><label>Recommended claims action<select value={finding.recommendedAction} onChange={e=>setFinding({...finding,recommendedAction:e.target.value})}><option value="continue_claim_review">Continue normal claim review</option><option value="additional_documentation">Request additional documentation</option><option value="coverage_review">Additional coverage review</option><option value="liability_review">Additional liability review</option><option value="management_review">Management review</option></select></label><label>Finding summary<textarea rows="5" value={finding.summary} onChange={e=>setFinding({...finding,summary:e.target.value})}/></label>{can(staff,PERMISSIONS.SIU_FINDING)&&<button className="primary" onClick={submitFinding}>Submit finding</button>}</div><div className="table-card"><div className="table-toolbar"><strong>Findings</strong><span>{caseFindings.length}</span></div><div className="siu-finding-list">{caseFindings.map(f=><div key={f.id}><ClipboardCheck size={16}/><div><strong>{f.classification.replaceAll("_"," ")}</strong><span>{f.summary}</span><small>{f.recommendedAction.replaceAll("_"," ")} • {f.status}</small></div></div>)}</div></div>{selected.status==="open"&&selected.stage!=="supervisor_review"&&can(staff,PERMISSIONS.SIU_FINDING)&&<div className="panel siu-disposition"><div className="eyebrow">CLAIMS HANDOFF</div><h3>Complete SIU investigation</h3><p>Closing SIU returns a documented result to Claims. It does not automatically approve or deny coverage.</p><div className="action-stack"><button className="secondary" onClick={()=>finalizeCase("no_adverse_finding","Investigation completed with no adverse finding.")}>Close — no adverse finding</button><button className="secondary" onClick={()=>finalizeCase("inconclusive","Investigation completed without a conclusive adverse finding.")}>Close — inconclusive</button><button className="primary" onClick={()=>finalizeCase("findings_returned_to_claims",caseFindings[0]?.summary||"SIU findings returned to Claims for review.")}>Return findings to Claims</button></div></div>}</div>}

      {tab==="timeline"&&<div className="timeline">{caseActions.map(a=><div key={a.id}><span className="timeline-dot"></span><div><strong>{a.summary}</strong><p>{a.type.replaceAll("_"," ")}</p><small>{a.createdByName||"Staff"} • {a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div>}
    </div></div>}
  </section>
}
