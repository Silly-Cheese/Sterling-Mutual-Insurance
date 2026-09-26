import {useEffect,useState} from "react";
import {initializeApp,deleteApp} from "firebase/app";
import {createUserWithEmailAndPassword,getAuth,signOut as signOutSecondary,updateProfile} from "firebase/auth";
import {addDoc,collection,doc,getDocs,limit,orderBy,query,serverTimestamp,setDoc,updateDoc} from "firebase/firestore";
import {ArrowRight,FileCheck2,KeyRound,Plus,Search,ShieldAlert,UserRound,X} from "lucide-react";
import {db,firebaseConfig} from "../firebase";
import {can,PERMISSIONS} from "../permissions";
export default function Customers({staff,onNavigate,openNew}){
  const [customers,setCustomers]=useState([]),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[selected,setSelected]=useState(null),[search,setSearch]=useState(""),[accountOpen,setAccountOpen]=useState(false),[accountBusy,setAccountBusy]=useState(false),[accountMessage,setAccountMessage]=useState("");
  const [form,setForm]=useState({firstName:"",lastName:"",email:"",phone:""});
  const [accountForm,setAccountForm]=useState({email:"",password:""});
  async function load(){const q=query(collection(db,"customers"),orderBy("createdAt","desc"),limit(50));const snap=await getDocs(q);setCustomers(snap.docs.map(d=>({id:d.id,...d.data()})))}
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(openNew)setOpen(true)},[openNew]);
  async function createCustomer(e){
    e.preventDefault();setSaving(true);
    try{await addDoc(collection(db,"customers"),{...form,displayName:(form.firstName.trim()+" "+form.lastName.trim()).trim(),status:"prospect",authUid:null,createdAt:serverTimestamp(),createdBy:staff.id});setOpen(false);setForm({firstName:"",lastName:"",email:"",phone:""});await load()}
    finally{setSaving(false)}
  }
  async function openCustomerAccount(e){
    e.preventDefault();
    if(!selected||!can(staff,PERMISSIONS.CUSTOMER_ACCOUNT_MANAGE))return;
    setAccountBusy(true);setAccountMessage("");
    let secondaryApp=null;
    try{
      secondaryApp=initializeApp(firebaseConfig,"customer-account-"+Date.now());
      const secondaryAuth=getAuth(secondaryApp);
      const credential=await createUserWithEmailAndPassword(secondaryAuth,accountForm.email.trim(),accountForm.password);
      await updateProfile(credential.user,{displayName:selected.displayName||"Sterling Mutual Customer"});
      await setDoc(doc(db,"customerAccounts",credential.user.uid),{
        authUid:credential.user.uid,
        customerId:selected.id,
        email:accountForm.email.trim().toLowerCase(),
        displayName:selected.displayName||"",
        status:"active",
        createdAt:serverTimestamp(),
        createdBy:staff.id
      });
      await updateDoc(doc(db,"customers",selected.id),{
        authUid:credential.user.uid,
        portalEmail:accountForm.email.trim().toLowerCase(),
        portalStatus:"active",
        updatedAt:serverTimestamp(),
        updatedBy:staff.id
      });
      await signOutSecondary(secondaryAuth);
      setAccountMessage("Customer account created and linked successfully.");
      setSelected(v=>({...v,authUid:credential.user.uid,portalEmail:accountForm.email.trim().toLowerCase(),portalStatus:"active"}));
      setAccountOpen(false);
      await load();
    }catch(err){
      const code=err?.code||"";
      if(code.includes("email-already-in-use"))setAccountMessage("That email is already used by another Firebase account.");
      else if(code.includes("weak-password"))setAccountMessage("Use a stronger temporary password.");
      else setAccountMessage("The customer account could not be created.");
    }finally{
      if(secondaryApp)try{await deleteApp(secondaryApp)}catch{}
      setAccountBusy(false);
    }
  }

  const filtered=customers.filter(c=>[c.displayName,c.email,c.phone].filter(Boolean).some(v=>String(v).toLowerCase().includes(search.toLowerCase())));
  return <section className="content">
  <div className="workflow-ribbon"><span>Intake</span><strong>Customer</strong><span>Quote</span><span>Underwriting</span><span>Policy</span><span>Service</span></div>
  <div className="page-heading"><div><div className="eyebrow">CUSTOMER OPERATIONS</div><h1>Customers</h1><p>The relationship hub for prospects, insureds, and every next step.</p></div>{can(staff,PERMISSIONS.CUSTOMER_CREATE)&&<button className="primary compact" onClick={()=>setOpen(true)}><Plus size={17}/> New customer</button>}</div>
  <div className="table-card"><div className="table-toolbar"><div className="search table-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, or phone…"/></div><span>{filtered.length} records</span></div>{filtered.length===0?<div className="empty-state"><UserRound size={30}/><h3>No matching customers.</h3><p>Create a customer or adjust your search.</p></div>:<div className="customer-list">{filtered.map(c=><button className="customer-row" key={c.id} onClick={()=>onNavigate?.("Customer Workspace",{customerId:c.id})}><div className="avatar small">{(c.firstName?.[0]||"")+(c.lastName?.[0]||"")}</div><div><strong>{c.displayName}</strong><span>{c.email||"No email"} • {c.phone||"No phone"}</span></div><span className="status-pill prospect">{c.status}</span><span className="customer-id">{c.source==="walk_in"?"WALK-IN":c.id.slice(0,8).toUpperCase()}</span></button>)}</div>}</div>
  {open&&<div className="modal-backdrop"><form className="modal" onSubmit={createCustomer}><div className="modal-head"><div><div className="eyebrow">CUSTOMER REGISTRY</div><h2>Create customer</h2></div><button type="button" onClick={()=>setOpen(false)}><X/></button></div><p>A portal login is not required. You can invite the customer later.</p><div className="two-col"><label>First name<input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} required/></label><label>Last name<input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} required/></label></div><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Creating…":"Create customer"}</button></div></form></div>}{selected&&<div className="modal-backdrop"><div className="modal customer-detail"><div className="modal-head"><div><div className="eyebrow">CUSTOMER RECORD</div><h2>{selected.displayName}</h2></div><button onClick={()=>setSelected(null)}><X/></button></div><div className="record-summary"><div><span>Email</span><strong>{selected.email||"Not provided"}</strong></div><div><span>Phone</span><strong>{selected.phone||"Not provided"}</strong></div><div><span>Status</span><strong>{selected.status||"prospect"}</strong></div><div><span>Source</span><strong>{selected.source==="walk_in"?"Walk-in":"Direct"}</strong></div></div><div className="next-actions"><div><div className="eyebrow">NEXT BEST ACTION</div><h3>Continue this customer relationship</h3></div>{can(staff,PERMISSIONS.CUSTOMER_ACCOUNT_MANAGE)&&!selected.authUid&&<button className="secondary" onClick={()=>{setAccountForm({email:selected.email||"",password:""});setAccountMessage("");setAccountOpen(true)}}><KeyRound size={15}/> Open customer account</button>}{selected.authUid&&<span className="status-pill current">PORTAL ACTIVE</span>}<button className="primary" onClick={()=>onNavigate?.("Quotes & Applications",{customerId:selected.id})}>Start quote <ArrowRight size={15}/></button><button className="secondary" onClick={()=>onNavigate?.("Policies",{customerId:selected.id})}><FileCheck2 size={15}/> View policies</button><button className="secondary" onClick={()=>onNavigate?.("Claims",{customerId:selected.id})}><ShieldAlert size={15}/> File claim</button></div></div></div>}{accountOpen&&selected&&<div className="modal-backdrop"><form className="modal" onSubmit={openCustomerAccount}><div className="modal-head"><div><div className="eyebrow">CUSTOMER PORTAL</div><h2>Open customer account</h2></div><button type="button" onClick={()=>setAccountOpen(false)}><X/></button></div><p>This creates a customer-only Firebase login linked to {selected.displayName}. It does not create staff access.</p><label>Portal email<input type="email" value={accountForm.email} onChange={e=>setAccountForm({...accountForm,email:e.target.value})} required/></label><label>Temporary password<input type="password" minLength="8" value={accountForm.password} onChange={e=>setAccountForm({...accountForm,password:e.target.value})} required/></label>{accountMessage&&<div className={accountMessage.includes("successfully")?"notice-box":"error-box"}>{accountMessage}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setAccountOpen(false)}>Cancel</button><button className="primary" disabled={accountBusy}>{accountBusy?"Creating…":"Create customer account"}</button></div></form></div>}</section>
}
