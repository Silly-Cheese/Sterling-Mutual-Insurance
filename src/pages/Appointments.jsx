import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {CalendarDays,CheckCircle2,Clock3,Plus,UsersRound,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const empty={customerId:"",customerName:"",date:"",time:"",department:"Sales",reason:"",notes:""};

export default function Appointments({staff,onNavigate,openNew}){
  const [appointments,setAppointments]=useState([]),[customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(empty),[saving,setSaving]=useState(false);

  async function load(){
    const [a,c]=await Promise.all([getDocs(collection(db,"appointments")),getDocs(collection(db,"customers"))]);
    setAppointments(a.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(x.date+x.time).localeCompare(String(y.date+y.time))));
    setCustomers(c.docs.map(d=>({id:d.id,...d.data()})));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(openNew)setOpen(true)},[openNew]);

  const today=new Date().toISOString().slice(0,10);
  const todays=appointments.filter(a=>a.date===today&&!["completed","cancelled"].includes(a.status));
  const upcoming=appointments.filter(a=>a.date>today&&!["completed","cancelled"].includes(a.status)).slice(0,16);
  const done=appointments.filter(a=>["completed","cancelled"].includes(a.status)).slice(-12).reverse();

  async function create(e){
    e.preventDefault();setSaving(true);
    try{
      const customer=customers.find(c=>c.id===form.customerId);
      await addDoc(collection(db,"appointments"),{
        ...form,
        customerName:customer?.displayName||form.customerName||"Guest",
        status:"scheduled",
        assignedTo:"",
        assignedName:"",
        createdAt:serverTimestamp(),
        createdBy:staff.id
      });
      setOpen(false);setForm(empty);await load();
    }finally{setSaving(false)}
  }

  async function patch(a,patch){
    await updateDoc(doc(db,"appointments",a.id),{...patch,updatedAt:serverTimestamp(),updatedBy:staff.id});
    await load();
  }

  async function checkIn(a){
    await patch(a,{status:"checked_in",checkedInAt:serverTimestamp()});
    if(can(staff,PERMISSIONS.WALKIN_CREATE)){
      await addDoc(collection(db,"walkIns"),{
        firstName:a.customerName?.split(" ")[0]||a.customerName,
        lastName:a.customerName?.split(" ").slice(1).join(" ")||"",
        displayName:a.customerName,
        phone:"",
        email:"",
        reason:a.department==="Claims"?"claim":a.department==="Billing"?"billing":a.department==="Policy Service"?"policy_service":"new_quote",
        productInterest:"unsure",
        priority:"normal",
        notes:"Scheduled appointment: "+(a.reason||a.department),
        appointmentId:a.id,
        status:"waiting",
        checkedInAt:serverTimestamp(),
        createdBy:staff.id
      });
      onNavigate?.("Walk-ins");
    }
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">FRONT OFFICE</div><h1>Appointments</h1><p>Schedule customer visits, see today's calendar, and check arrivals directly into the live lobby.</p></div>{can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={16}/> New appointment</button>}</div>

    <div className="frontdesk-strip">
      <div><span className="frontdesk-number">{todays.length}</span><span>Today</span></div>
      <div><span className="frontdesk-number">{todays.filter(a=>a.status==="checked_in").length}</span><span>Checked in</span></div>
      <div><span className="frontdesk-number">{upcoming.length}</span><span>Upcoming</span></div>
      <div><span className="frontdesk-number">{appointments.filter(a=>a.status==="completed").length}</span><span>Completed</span></div>
    </div>

    <div className="appointment-grid">
      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">TODAY</div><h2>Today's appointments</h2></div></div>
        {todays.length===0?<div className="queue-empty"><CalendarDays size={28}/><h3>No appointments today.</h3><p>The front desk is clear.</p></div>:<div className="appointment-list">{todays.map(a=><div className="appointment-card" key={a.id}><div className="appointment-time">{a.time||"—"}</div><div><strong>{a.customerName}</strong><span>{a.department} • {a.reason||"General appointment"}</span><small>{a.status.replaceAll("_"," ")}</small></div><div className="appointment-actions">{a.status==="scheduled"&&<button className="primary compact" onClick={()=>checkIn(a)}>Check in</button>}<button className="secondary compact" onClick={()=>patch(a,{status:"completed",completedAt:serverTimestamp()})}><CheckCircle2 size={14}/> Complete</button></div></div>)}</div>}
      </article>
      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">UPCOMING</div><h2>Next appointments</h2></div></div>
        {upcoming.length===0?<div className="queue-empty"><Clock3 size={28}/><h3>Nothing scheduled ahead.</h3></div>:<div className="appointment-list">{upcoming.map(a=><div className="appointment-card compact" key={a.id}><div className="appointment-date">{a.date}</div><div><strong>{a.customerName}</strong><span>{a.time} • {a.department}</span></div></div>)}</div>}
      </article>
    </div>

    <div className="table-card"><div className="table-toolbar"><strong>Recent appointment history</strong><span>{done.length}</span></div>{done.length===0?<div className="empty-state compact-empty">Completed and cancelled appointments will appear here.</div>:<div className="appointment-history">{done.map(a=><div key={a.id}><span className={"status-pill "+a.status}>{a.status}</span><div><strong>{a.customerName}</strong><span>{a.date} {a.time} • {a.department}</span></div></div>)}</div>}</div>

    {open&&<div className="modal-backdrop"><form className="modal" onSubmit={create}><div className="modal-head"><div><div className="eyebrow">SCHEDULE VISIT</div><h2>New appointment</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><label>Customer<select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Guest / not yet a customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>{!form.customerId&&<label>Guest name<input value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})} required/></label>}<div className="two-col"><label>Date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></label><label>Time<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/></label></div><label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}><option>Sales</option><option>Policy Service</option><option>Claims</option><option>Billing</option><option>Management</option></select></label><label>Reason<input value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="What are they coming in for?"/></label><label>Notes<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Scheduling…":"Schedule appointment"}</button></div></form></div>}
  </section>
}
