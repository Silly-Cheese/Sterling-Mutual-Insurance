import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDoc,getDocs,query,serverTimestamp,updateDoc,where} from "firebase/firestore";
import {AlertTriangle,ArrowLeft,Bell,ClipboardList,CreditCard,FileCheck2,FileText,KeyRound,MessageSquare,ShieldAlert,Star,UserRound} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));

export default function CustomerWorkspace({staff,customerId,onNavigate}){
  const [customer,setCustomer]=useState(null),[policies,setPolicies]=useState([]),[quotes,setQuotes]=useState([]),[claims,setClaims]=useState([]),[billing,setBilling]=useState([]),[documents,setDocuments]=useState([]),[notes,setNotes]=useState([]),[activity,setActivity]=useState([]),[serviceRequests,setServiceRequests]=useState([]),[staffList,setStaffList]=useState([]),[tab,setTab]=useState("overview"),[note,setNote]=useState(""),[alertText,setAlertText]=useState("");

  async function safeQuery(name,field,value){
    try{const s=await getDocs(query(collection(db,name),where(field,"==",value)));return s.docs.map(d=>({id:d.id,...d.data()}))}catch{return []}
  }
  async function load(){
    const snap=await getDoc(doc(db,"customers",customerId));
    if(!snap.exists())return;
    const c={id:snap.id,...snap.data()};setCustomer(c);
    const [p,q,cl,b,d,n,a,sr,staffSnap]=await Promise.all([
      safeQuery("policies","customerId",customerId),safeQuery("quotes","customerId",customerId),safeQuery("claims","customerId",customerId),
      safeQuery("billingTransactions","customerId",customerId),safeQuery("documents","customerId",customerId),safeQuery("customerNotes","customerId",customerId),
      safeQuery("customerActivity","customerId",customerId),safeQuery("serviceRequests","customerId",customerId),getDocs(collection(db,"staff")).catch(()=>null)
    ]);
    setPolicies(p);setQuotes(q);setClaims(cl);setBilling(b);setDocuments(d);setNotes(n.sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));setActivity(a.sort((x,y)=>(y.createdAt?.seconds||0)-(x.createdAt?.seconds||0)));setServiceRequests(sr);
    if(staffSnap)setStaffList(staffSnap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.status==="active"));
    try{
      const recent=JSON.parse(localStorage.getItem("smi-recent-customers")||"[]").filter(x=>x.id!==customerId);
      localStorage.setItem("smi-recent-customers",JSON.stringify([{id:customerId,name:c.displayName},...recent].slice(0,8)));
    }catch{}
  }
  useEffect(()=>{load().catch(()=>{})},[customerId]);

  async function record(type,summary,details={}){
    await addDoc(collection(db,"customerActivity"),{customerId,type,summary,details,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
  }

  async function assignOwner(ownerId){
    const owner=staffList.find(s=>s.id===ownerId);
    await updateDoc(doc(db,"customers",customerId),{ownerId:ownerId||"",ownerName:owner?.displayName||"",updatedAt:serverTimestamp(),updatedBy:staff.id});
    await record("customer.owner.changed",ownerId?"Assigned customer owner to "+owner.displayName:"Removed customer owner");
    await load();
  }

  async function addNote(){
    if(!note.trim())return;
    await addDoc(collection(db,"customerNotes"),{customerId,text:note.trim(),authorUid:staff.id,authorName:staff.displayName,createdAt:serverTimestamp(),visibility:"staff"});
    await record("customer.note.added","Internal note added");
    setNote("");await load();
  }

  async function setAlert(){
    await updateDoc(doc(db,"customers",customerId),{pinnedAlert:alertText.trim(),updatedAt:serverTimestamp(),updatedBy:staff.id});
    await record("customer.alert.changed",alertText.trim()?"Pinned customer alert updated":"Pinned customer alert removed");
    setCustomer(v=>({...v,pinnedAlert:alertText.trim()}));
  }

  function toggleFavorite(){
    try{
      const key="smi-favorite-customers";
      const list=JSON.parse(localStorage.getItem(key)||"[]");
      const exists=list.some(x=>x.id===customerId);
      const next=exists?list.filter(x=>x.id!==customerId):[{id:customerId,name:customer.displayName},...list];
      localStorage.setItem(key,JSON.stringify(next));
      setCustomer(v=>({...v,_favorite:!exists}));
    }catch{}
  }

  const balance=useMemo(()=>billing.reduce((sum,t)=>sum+(t.type==="charge"?Number(t.amount||0):["payment","credit","refund"].includes(t.type)?-Number(t.amount||0):0),0),[billing]);
  if(!customer)return <section className="content"><div className="empty-state"><UserRound size={30}/><h3>Customer record unavailable.</h3></div></section>;

  const tabs=[["overview","Overview"],["policies","Policies"],["quotes","Quotes"],["claims","Claims"],["billing","Billing"],["documents","Documents"],["notes","Notes"],["activity","Activity"],["portal","Portal"]];
  return <section className="content customer-workspace">
    <button className="back-link workspace-back" onClick={()=>onNavigate?.("Customers")}><ArrowLeft size={15}/> Customers</button>
    {customer.pinnedAlert&&<div className="customer-alert"><AlertTriangle size={17}/><strong>{customer.pinnedAlert}</strong></div>}
    <div className="customer-workspace-hero">
      <div className="customer-identity"><div className="avatar customer-avatar">{(customer.firstName?.[0]||"")+(customer.lastName?.[0]||"")}</div><div><div className="eyebrow">CUSTOMER ACCOUNT</div><h1>{customer.displayName}</h1><p>{customer.email||"No email"} • {customer.phone||"No phone"}</p></div></div>
      <div className="customer-hero-actions"><button className="secondary compact" onClick={toggleFavorite}><Star size={15}/> Favorite</button><button className="primary compact" onClick={()=>onNavigate?.("Quotes & Applications",{customerId})}>Start quote</button></div>
    </div>

    <div className="customer-kpis"><div><span>Relationship</span><strong>{customer.status||"prospect"}</strong></div><div><span>Account owner</span><strong>{customer.ownerName||"Unassigned"}</strong></div><div><span>Active policies</span><strong>{policies.filter(p=>p.status==="active").length}</strong></div><div><span>Open claims</span><strong>{claims.filter(c=>!["closed","denied"].includes(c.status)).length}</strong></div><div><span>Billing balance</span><strong>{money(balance)}</strong></div></div>

    <div className="record-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</div>

    {tab==="overview"&&<div className="workspace-grid">
      <article className="panel customer-overview-card"><div className="panel-head"><div><div className="eyebrow">RELATIONSHIP</div><h2>Customer profile</h2></div></div><div className="record-summary"><div><span>Email</span><strong>{customer.email||"Not provided"}</strong></div><div><span>Phone</span><strong>{customer.phone||"Not provided"}</strong></div><div><span>Source</span><strong>{customer.source==="walk_in"?"Walk-in":"Direct"}</strong></div><div><span>Portal</span><strong>{customer.authUid?"Active":"Not opened"}</strong></div></div>{can(staff,PERMISSIONS.CUSTOMER_UPDATE)&&<label className="owner-select">Primary agent / owner<select value={customer.ownerId||""} onChange={e=>assignOwner(e.target.value)}><option value="">Unassigned</option>{staffList.map(s=><option key={s.id} value={s.id}>{s.displayName} — {s.title}</option>)}</select></label>}</article>
      <article className="panel"><div className="panel-head"><div><div className="eyebrow">SERVICE</div><h2>Open requests</h2></div><span className="status-pill">{serviceRequests.filter(r=>!["completed","denied"].includes(r.status)).length}</span></div>{serviceRequests.length===0?<div className="queue-empty"><Bell size={28}/><h3>No customer requests.</h3></div>:<div className="mini-record-list">{serviceRequests.slice(0,6).map(r=><div key={r.id}><strong>{String(r.type||"request").replaceAll("_"," ")}</strong><span>{r.status}</span></div>)}</div>}</article>
      <article className="panel"><div className="panel-head"><div><div className="eyebrow">ALERT</div><h2>Pinned account alert</h2></div></div>{can(staff,PERMISSIONS.CUSTOMER_ALERTS)?<><textarea rows="3" value={alertText||customer.pinnedAlert||""} onChange={e=>setAlertText(e.target.value)} placeholder="Important warning or servicing instruction…"/><button className="secondary compact" onClick={setAlert}>Save alert</button></>:<p>{customer.pinnedAlert||"No alert"}</p>}</article>
      <article className="panel"><div className="panel-head"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>Latest events</h2></div></div>{activity.length===0?<div className="queue-empty"><MessageSquare size={28}/><h3>No recorded activity yet.</h3></div>:<div className="activity-mini">{activity.slice(0,6).map(x=><div key={x.id}><span></span><div><strong>{x.summary}</strong><small>{x.actorName||"System"}</small></div></div>)}</div>}</article>
    </div>}

    {tab==="policies"&&<RecordList items={policies} empty="No policies on this customer." render={p=><><FileCheck2/><div><strong>{p.policyNumber}</strong><span>{p.product} • {p.status}</span></div><div><strong>{money(p.monthlyPremium)}/mo</strong><button onClick={()=>onNavigate?.("Policies",{customerId})}>Open</button></div></>}/>}
    {tab==="quotes"&&<RecordList items={quotes} empty="No quotes on this customer." render={q=><><ClipboardList/><div><strong>{q.quoteNumber}</strong><span>{q.product} • {q.status}</span></div><div><strong>{money(q.monthlyPremium)}/mo</strong><button onClick={()=>onNavigate?.("Quotes & Applications",{customerId})}>Open</button></div></>}/>}
    {tab==="claims"&&<RecordList items={claims} empty="No claims on this customer." render={c=><><ShieldAlert/><div><strong>{c.claimNumber}</strong><span>{c.lossType} • {c.status}</span></div><div><strong>{money(c.claimedAmount)}</strong><button onClick={()=>onNavigate?.("Claims",{customerId})}>Open</button></div></>}/>}
    {tab==="billing"&&<div className="table-card"><div className="table-toolbar"><strong>Billing history</strong><span>{billing.length} entries</span></div><div className="portal-record-list">{billing.map(t=><div key={t.id}><CreditCard/><div><strong>{t.type}</strong><span>{t.policyNumber} • {t.note||"No note"}</span></div><div><strong>{money(t.amount)}</strong></div></div>)}</div></div>}
    {tab==="documents"&&<RecordList items={documents} empty="No customer documents." render={d=><><FileText/><div><strong>{d.title||d.type||"Document"}</strong><span>{d.policyNumber||"Customer file"}</span></div><div><span>{d.status||"available"}</span></div></>}/>}
    {tab==="notes"&&<div className="notes-layout"><div className="panel">{can(staff,PERMISSIONS.CUSTOMER_NOTES)&&<><label>Internal note<textarea rows="4" value={note} onChange={e=>setNote(e.target.value)} placeholder="Visible to staff only…"/></label><button className="primary compact" onClick={addNote}>Add note</button></>}</div><div className="table-card"><div className="table-toolbar"><strong>Internal notes</strong><span>{notes.length}</span></div><div className="note-list">{notes.map(n=><div key={n.id}><strong>{n.authorName||"Staff"}</strong><p>{n.text}</p><small>{n.createdAt?.toDate?n.createdAt.toDate().toLocaleString():"Recent"}</small></div>)}</div></div></div>}
    {tab==="activity"&&<div className="table-card"><div className="table-toolbar"><strong>Customer timeline</strong><span>{activity.length} events</span></div><div className="timeline">{activity.map(a=><div key={a.id}><span className="timeline-dot"></span><div><strong>{a.summary}</strong><p>{a.type}</p><small>{a.actorName||"System"} • {a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():"Recent"}</small></div></div>)}</div></div>}
    {tab==="portal"&&<div className="panel portal-account-panel"><KeyRound size={26}/><h2>{customer.authUid?"Customer portal is active":"No portal account linked"}</h2><p>{customer.authUid?("Portal email: "+(customer.portalEmail||customer.email||"Not listed")):"Open a customer portal from the customer directory to give this customer online access."}</p></div>}
  </section>
}

function RecordList({items,empty,render}){
  return <div className="table-card"><div className="table-toolbar"><strong>Records</strong><span>{items.length}</span></div>{items.length===0?<div className="empty-state">{empty}</div>:<div className="workspace-record-list">{items.map(item=><div key={item.id}>{render(item)}</div>)}</div>}</div>
}
