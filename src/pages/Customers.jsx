import {useEffect,useState} from "react";
import {addDoc,collection,getDocs,limit,orderBy,query,serverTimestamp} from "firebase/firestore";
import {Plus,Search,UserRound,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";
export default function Customers({staff}){
  const [customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[saving,setSaving]=useState(false);
  const [form,setForm]=useState({firstName:"",lastName:"",email:"",phone:""});
  async function load(){const q=query(collection(db,"customers"),orderBy("createdAt","desc"),limit(50));const snap=await getDocs(q);setCustomers(snap.docs.map(d=>({id:d.id,...d.data()})))}
  useEffect(()=>{load().catch(()=>{})},[]);
  async function createCustomer(e){
    e.preventDefault();setSaving(true);
    try{await addDoc(collection(db,"customers"),{...form,displayName:(form.firstName.trim()+" "+form.lastName.trim()).trim(),status:"prospect",authUid:null,createdAt:serverTimestamp(),createdBy:staff.id});setOpen(false);setForm({firstName:"",lastName:"",email:"",phone:""});await load()}
    finally{setSaving(false)}
  }
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">CUSTOMER OPERATIONS</div><h1>Customers</h1><p>Create and manage insurance customers—even before they have an online account.</p></div>{can(staff,PERMISSIONS.CUSTOMER_CREATE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={17}/> New customer</button>}</div><div className="table-card"><div className="table-toolbar"><div className="search table-search"><Search size={16}/><input placeholder="Search customer records…"/></div><span>{customers.length} records</span></div>{customers.length===0?<div className="empty-state"><UserRound size={30}/><h3>No customers yet.</h3><p>Create the first Sterling Mutual customer to begin their insurance relationship.</p></div>:<div className="customer-list">{customers.map(c=><button className="customer-row" key={c.id}><div className="avatar small">{(c.firstName?.[0]||"")+(c.lastName?.[0]||"")}</div><div><strong>{c.displayName}</strong><span>{c.email||"No email"} • {c.phone||"No phone"}</span></div><span className="status-pill prospect">{c.status}</span><span className="customer-id">{c.id.slice(0,8).toUpperCase()}</span></button>)}</div>}</div>
  {open&&<div className="modal-backdrop"><form className="modal" onSubmit={createCustomer}><div className="modal-head"><div><div className="eyebrow">CUSTOMER REGISTRY</div><h2>Create customer</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><p>A portal login is not required. You can invite the customer later.</p><div className="two-col"><label>First name<input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} required/></label><label>Last name<input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} required/></label></div><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Creating…":"Create customer"}</button></div></form></div>}</section>
}
