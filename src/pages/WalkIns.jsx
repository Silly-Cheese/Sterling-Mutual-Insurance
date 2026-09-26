import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {ArrowRight,CheckCircle2,Clock3,Plus,UserCheck,UsersRound,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const empty={firstName:"",lastName:"",phone:"",email:"",reason:"new_quote",productInterest:"auto",priority:"normal",notes:""};

export default function WalkIns({staff,onNavigate,openNew}){
  const [walkIns,setWalkIns]=useState([]),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState(empty);
  async function load(){
    const snap=await getDocs(collection(db,"walkIns"));
    setWalkIns(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.checkedInAt?.seconds||0)-(a.checkedInAt?.seconds||0)));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(openNew)setOpen(true)},[openNew]);

  const waiting=walkIns.filter(w=>w.status==="waiting");
  const active=walkIns.filter(w=>w.status==="in_service");
  const completed=walkIns.filter(w=>["completed","converted"].includes(w.status)).slice(0,12);

  const myActive=useMemo(()=>active.filter(w=>w.assignedTo===staff.id),[active,staff.id]);

  async function checkIn(e){
    e.preventDefault();setSaving(true);
    try{
      await addDoc(collection(db,"walkIns"),{
        ...form,
        displayName:(form.firstName.trim()+" "+form.lastName.trim()).trim(),
        status:"waiting",
        checkedInAt:serverTimestamp(),
        createdBy:staff.id
      });
      setForm(empty);setOpen(false);await load();
    }finally{setSaving(false)}
  }

  async function claim(w){
    await updateDoc(doc(db,"walkIns",w.id),{
      status:"in_service",
      assignedTo:staff.id,
      assignedName:staff.displayName,
      serviceStartedAt:serverTimestamp()
    });
    await load();
  }

  async function complete(w){
    await updateDoc(doc(db,"walkIns",w.id),{status:"completed",completedAt:serverTimestamp()});
    await load();
  }

  async function convert(w,startQuote=false){
    if(!can(staff,PERMISSIONS.CUSTOMER_CREATE))return;
    const customerRef=await addDoc(collection(db,"customers"),{
      firstName:w.firstName||"",
      lastName:w.lastName||"",
      displayName:w.displayName||"",
      email:w.email||"",
      phone:w.phone||"",
      status:"prospect",
      authUid:null,
      source:"walk_in",
      walkInId:w.id,
      createdAt:serverTimestamp(),
      createdBy:staff.id
    });
    await updateDoc(doc(db,"walkIns",w.id),{
      status:"converted",
      customerId:customerRef.id,
      convertedAt:serverTimestamp(),
      convertedBy:staff.id
    });
    await load();
    onNavigate?.(startQuote?"Quotes & Applications":"Customers",{customerId:customerRef.id});
  }

  const reasonLabel=v=>({
    new_quote:"New quote",
    policy_service:"Policy service",
    claim:"Claim help",
    billing:"Billing",
    general:"General question"
  }[v]||"Walk-in");

  function elapsed(ts){
    if(!ts?.toDate)return "Just arrived";
    const mins=Math.max(0,Math.round((Date.now()-ts.toDate().getTime())/60000));
    return mins<1?"Just arrived":mins+" min";
  }

  return <section className="content walkins-page">
    <div className="workflow-ribbon"><strong>Intake</strong><span>Customer</span><span>Quote</span><span>Underwriting</span><span>Policy</span><span>Service</span></div>
    <div className="page-heading">
      <div><div className="eyebrow">FRONT OFFICE</div><h1>Walk-in Desk</h1><p>Check people in, manage the live lobby, and hand them directly into the customer and quote workflow.</p></div>
      {can(staff,PERMISSIONS.WALKIN_CREATE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={17}/> Check in walk-in</button>}
    </div>

    <div className="frontdesk-strip">
      <div><span className="frontdesk-number">{waiting.length}</span><span>Waiting</span></div>
      <div><span className="frontdesk-number">{active.length}</span><span>Being helped</span></div>
      <div><span className="frontdesk-number">{myActive.length}</span><span>Assigned to me</span></div>
      <div><span className="frontdesk-number">{walkIns.filter(w=>w.status==="converted").length}</span><span>Converted</span></div>
    </div>

    <div className="walkin-board">
      <article className="panel walkin-column">
        <div className="panel-head"><div><div className="eyebrow">LOBBY</div><h2>Waiting now</h2></div><span className={"status-pill "+(waiting.length?"late":"current")}>{waiting.length?waiting.length+" WAITING":"CLEAR"}</span></div>
        {waiting.length===0?<div className="queue-empty"><UsersRound size={28}/><h3>The lobby is clear.</h3><p>New walk-ins will appear here immediately.</p></div>:
        <div className="walkin-list">{waiting.map(w=><div className={"walkin-card "+(w.priority==="urgent"?"urgent":"")} key={w.id}>
          <div className="walkin-avatar">{(w.firstName?.[0]||"")+(w.lastName?.[0]||"")}</div>
          <div className="walkin-main"><strong>{w.displayName}</strong><span>{reasonLabel(w.reason)} • {w.productInterest?.toUpperCase()}</span><small><Clock3 size={12}/> {elapsed(w.checkedInAt)}{w.phone?" • "+w.phone:""}</small></div>
          {can(staff,PERMISSIONS.WALKIN_MANAGE)&&<button className="primary compact" onClick={()=>claim(w)}><UserCheck size={15}/> Help</button>}
        </div>)}</div>}
      </article>

      <article className="panel walkin-column">
        <div className="panel-head"><div><div className="eyebrow">IN SERVICE</div><h2>Active conversations</h2></div></div>
        {active.length===0?<div className="queue-empty"><CheckCircle2 size={28}/><h3>No active walk-ins.</h3><p>Claim someone from the lobby when you are ready.</p></div>:
        <div className="walkin-list">{active.map(w=><div className="walkin-card service" key={w.id}>
          <div className="walkin-avatar">{(w.firstName?.[0]||"")+(w.lastName?.[0]||"")}</div>
          <div className="walkin-main"><strong>{w.displayName}</strong><span>{reasonLabel(w.reason)} • with {w.assignedName||"Staff"}</span>{w.notes&&<small>{w.notes}</small>}</div>
          <div className="walkin-actions">
            {can(staff,PERMISSIONS.CUSTOMER_CREATE)&&<button className="primary compact" onClick={()=>convert(w,false)}>Create customer</button>}
            {can(staff,PERMISSIONS.CUSTOMER_CREATE)&&can(staff,PERMISSIONS.QUOTE_CREATE)&&<button className="secondary compact" onClick={()=>convert(w,true)}>Customer + quote <ArrowRight size={14}/></button>}
            <button className="secondary compact" onClick={()=>complete(w)}>Done</button>
          </div>
        </div>)}</div>}
      </article>
    </div>

    <div className="table-card walkin-history">
      <div className="table-toolbar"><strong>Recent front-desk activity</strong><span>{completed.length} recent</span></div>
      {completed.length===0?<div className="empty-state compact-empty">Completed and converted walk-ins will appear here.</div>:
      <div className="walkin-history-list">{completed.map(w=><div key={w.id}><span className="status-pill current">{w.status}</span><div><strong>{w.displayName}</strong><span>{reasonLabel(w.reason)} • {w.assignedName||"Unassigned"}</span></div><span>{w.customerId?"Customer created":"Visit completed"}</span></div>)}</div>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal" onSubmit={checkIn}>
      <div className="modal-head"><div><div className="eyebrow">FRONT DESK INTAKE</div><h2>Check in walk-in</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div>
      <p>Capture only what you need to get them into the queue. Details can be completed with the staff member helping them.</p>
      <div className="two-col"><label>First name<input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} required/></label><label>Last name<input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} required/></label></div>
      <div className="two-col"><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label></div>
      <div className="two-col"><label>Reason for visit<select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}><option value="new_quote">New quote</option><option value="policy_service">Policy service</option><option value="claim">Claim help</option><option value="billing">Billing</option><option value="general">General question</option></select></label><label>Product interest<select value={form.productInterest} onChange={e=>setForm({...form,productInterest:e.target.value})}><option value="auto">Auto</option><option value="home">Home</option><option value="business">Commercial</option><option value="unsure">Not sure</option></select></label></div>
      <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
      <label>Front-desk notes<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="What do they need help with?"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Checking in…":"Add to lobby"}</button></div>
    </form></div>}
  </section>
}
