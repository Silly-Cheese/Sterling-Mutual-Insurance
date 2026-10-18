import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc,writeBatch} from "firebase/firestore";
import {CalendarDays,CheckCircle2,Clock3,Plus,UsersRound,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";
import {localISODate,filterAppointments} from "../utils/date";

const empty={customerId:"",customerName:"",date:"",time:"",department:"Sales",reason:"",notes:""};

export default function Appointments({staff,onNavigate,openNew}){
  const [appointments,setAppointments]=useState([]),[customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(empty),[saving,setSaving]=useState(false),[error,setError]=useState(""),[customerError,setCustomerError]=useState(""),[workingId,setWorkingId]=useState("");
  const [queryText,setQueryText]=useState(""),[statusFilter,setStatusFilter]=useState("all"),[sortBy,setSortBy]=useState("soonest");

  async function load(){
    const appointmentsRequest=getDocs(collection(db,"appointments"));
    const customersRequest=can(staff,PERMISSIONS.CUSTOMER_READ)
      ? getDocs(collection(db,"customers")):Promise.resolve(null);
    const [a,customersResult]=await Promise.allSettled([appointmentsRequest,customersRequest]);
    if(a.status==="rejected"){
      setError("Unable to load appointments: "+(a.reason?.message||"Check appointment.read permission."));
    }else{
      setAppointments(a.value.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(x.date+x.time).localeCompare(String(y.date+y.time))));
    }
    if(customersResult.status==="fulfilled"){
      setCustomers(customersResult.value?.docs.map(d=>({id:d.id,...d.data()}))||[]);
      setCustomerError("");
    }else{
      setCustomers([]);
      setCustomerError("Customer directory is unavailable. You can still schedule an appointment for a guest.");
    }
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(openNew)setOpen(true)},[openNew]);

  const today=localISODate();
  const todays=appointments.filter(a=>a.date===today&&!["completed","cancelled"].includes(a.status));
  const upcoming=appointments.filter(a=>a.date>today&&!["completed","cancelled"].includes(a.status)).slice(0,16);
  const done=appointments.filter(a=>["completed","cancelled"].includes(a.status)).slice(-12).reverse();
  const matching=useMemo(()=>filterAppointments(appointments,{query:queryText,status:statusFilter,sort:sortBy}),[appointments,queryText,statusFilter,sortBy]);

  async function create(e){
    e.preventDefault();
    if(!can(staff,PERMISSIONS.APPOINTMENT_MANAGE)){setError("Your account needs appointment.manage permission.");return;}
    if(!form.date||!form.time){setError("Select an appointment date and time.");return;}
    const customer=customers.find(c=>c.id===form.customerId);
    const name=(customer?.displayName||form.customerName||"").trim();
    if(!name){setError("Select a customer or enter a guest name.");return;}
    setSaving(true);setError("");
    try{
      const appointment=await addDoc(collection(db,"appointments"),{
        ...form,customerId:customer?.id||"",
        customerName:name,status:"scheduled",assignedTo:"",assignedName:"",
        createdAt:serverTimestamp(),createdBy:staff.id,
        createdByName:staff.displayName||"Sterling Mutual Staff"
      });
      // A successful Firestore write is the confirmation; refresh errors should not hide it.
      setOpen(false);setForm(empty);
      setAppointments(old=>[...old,{id:appointment.id,...form,customerId:customer?.id||"",customerName:name,status:"scheduled"}]);
      await load();
    }catch(err){
      setError("Appointment was not created: "+(err?.message||"Unknown error")+". Verify appointment.manage permission and Firestore connectivity.");
    }finally{setSaving(false);}
  }

  async function patch(a,changes){
    if(!can(staff,PERMISSIONS.APPOINTMENT_MANAGE)){setError("You need appointment.manage to change appointment status.");return;}
    setWorkingId(a.id);setError("");
    try{
      await updateDoc(doc(db,"appointments",a.id),{...changes,updatedAt:serverTimestamp(),updatedBy:staff.id});
      await load();
    }catch(err){setError("Could not update appointment: "+(err?.message||"Unknown error"));}
    finally{setWorkingId("");}
  }
  async function checkIn(a){
    if(!can(staff,PERMISSIONS.APPOINTMENT_MANAGE)){setError("You need appointment.manage to check in visitors.");return;}
    if(workingId)return;
    setWorkingId(a.id);setError("");
    try{
      const batch=writeBatch(db);
      batch.update(doc(db,"appointments",a.id),{
        status:"checked_in",checkedInAt:serverTimestamp(),updatedBy:staff.id,updatedAt:serverTimestamp()
      });
      if(can(staff,PERMISSIONS.WALKIN_CREATE)){
        // Stable document ID prevents duplicate lobby tickets for a repeated check-in.
        batch.set(doc(db,"walkIns","appointment-"+a.id),{
          firstName:a.customerName?.split(" ")[0]||a.customerName,
          lastName:a.customerName?.split(" ").slice(1).join(" ")||"",
          displayName:a.customerName,phone:"",email:"",
          reason:a.department==="Claims"?"claim":a.department==="Billing"?"billing":a.department==="Policy Service"?"policy_service":"new_quote",
          productInterest:"unsure",priority:"normal",
          notes:"Scheduled appointment: "+(a.reason||a.department),appointmentId:a.id,
          status:"waiting",checkedInAt:serverTimestamp(),createdBy:staff.id
        });
      }
      await batch.commit();
      await load();
      if(can(staff,PERMISSIONS.WALKIN_CREATE))onNavigate?.("Walk-ins");
    }catch(err){setError("Check-in failed: "+(err?.message||"Unknown error"));}
    finally{setWorkingId("");}
  }

  return <section className="content">
    {error&&<div className="billing-inline-error" role="alert"><strong>Appointment error</strong><span>{error}</span><button type="button" onClick={()=>setError("")}>Dismiss</button></div>}
    {customerError&&<div className="billing-inline-error" role="status"><span>{customerError}</span></div>}
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
        {todays.length===0?<div className="queue-empty"><CalendarDays size={28}/><h3>No appointments today.</h3><p>The front desk is clear.</p></div>:<div className="appointment-list">{todays.map(a=><div className="appointment-card" key={a.id}><div className="appointment-time">{a.time||"—"}</div><div><strong>{a.customerName}</strong><span>{a.department} • {a.reason||"General appointment"}</span><small>{a.status.replaceAll("_"," ")}</small></div><div className="appointment-actions">{can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&a.status==="scheduled"&&<button className="primary compact" disabled={workingId===a.id} onClick={()=>checkIn(a)}>Check in</button>}{can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&["scheduled","checked_in"].includes(a.status)&&<button className="secondary compact" disabled={workingId===a.id} onClick={()=>patch(a,{status:"completed",completedAt:serverTimestamp()})}><CheckCircle2 size={14}/> Complete</button>}</div></div>)}</div>}
      </article>
      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">UPCOMING</div><h2>Next appointments</h2></div></div>
        {upcoming.length===0?<div className="queue-empty"><Clock3 size={28}/><h3>Nothing scheduled ahead.</h3></div>:<div className="appointment-list">{upcoming.map(a=><div className="appointment-card compact" key={a.id}><div className="appointment-date">{a.date}</div><div><strong>{a.customerName}</strong><span>{a.time} • {a.department}</span></div></div>)}</div>}
      </article>
    </div>

    <div className="table-card appointment-register">
      <div className="table-toolbar"><div><strong>All appointments</strong><small> Find visits by customer, department, or date.</small></div><span>{matching.length} of {appointments.length}</span></div>
      <div className="appointment-register-filters">
        <label>Search<input aria-label="Search appointments" type="search" value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Customer, department, reason or date"/></label>
        <label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option><option value="scheduled">Scheduled</option>
          <option value="checked_in">Checked in</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
        </select></label>
        <label>Sort<select value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="soonest">Earliest first</option><option value="latest">Latest first</option>
          <option value="customer">Customer A–Z</option>
        </select></label>
      </div>
      {matching.length===0?<div className="empty-state compact-empty">No appointments match these filters.</div>:
       <div className="appointment-list appointment-register-list">{matching.slice(0,100).map(a=><div key={a.id} className="appointment-card compact">
        <div className="appointment-date">{a.date}<small>{a.time||"—"}</small></div>
        <div><strong>{a.customerName||"Guest"}</strong><span>{a.department} • {a.reason||"General appointment"}</span><small>{(a.status||"scheduled").replaceAll("_"," ")}</small></div>
        <div className="appointment-actions">{can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&a.status==="scheduled"&&<button className="secondary compact" disabled={workingId===a.id} onClick={()=>checkIn(a)}>Check in</button>}{can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&["scheduled","checked_in"].includes(a.status)&&<button className="secondary compact" disabled={workingId===a.id} onClick={()=>patch(a,{status:"completed",completedAt:serverTimestamp()})}>Complete</button>}</div>
       </div>)}</div>}
      {matching.length>100&&<p className="muted">Showing the first 100 matching appointments. Narrow the search to find older visits.</p>}
    </div>

    <div className="table-card"><div className="table-toolbar"><strong>Recent appointment history</strong><span>{done.length}</span></div>{done.length===0?<div className="empty-state compact-empty">Completed and cancelled appointments will appear here.</div>:<div className="appointment-history">{done.map(a=><div key={a.id}><span className={"status-pill "+a.status}>{a.status}</span><div><strong>{a.customerName}</strong><span>{a.date} {a.time} • {a.department}</span></div></div>)}</div>}</div>

    {open&&<div className="modal-backdrop"><form className="modal" onSubmit={create}>{error&&<div className="billing-inline-error" role="alert"><span>{error}</span></div>}<div className="modal-head"><div><div className="eyebrow">SCHEDULE VISIT</div><h2>New appointment</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><label>Customer<select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Guest / not yet a customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>{!form.customerId&&<label>Guest name<input value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})} required/></label>}<div className="two-col"><label>Date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></label><label>Time<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/></label></div><label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}><option>Sales</option><option>Policy Service</option><option>Claims</option><option>Billing</option><option>Management</option></select></label><label>Reason<input value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="What are they coming in for?"/></label><label>Notes<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Scheduling…":"Schedule appointment"}</button></div></form></div>}
  </section>
}
