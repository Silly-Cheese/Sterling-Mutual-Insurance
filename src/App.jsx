import {useEffect,useMemo,useState} from "react";
import {Building2,ClipboardList,FileCheck2,LayoutDashboard,LogOut,Menu,Search,ShieldCheck,Users,WalletCards,X} from "lucide-react";
import {createUserWithEmailAndPassword,deleteUser,onAuthStateChanged,signInWithEmailAndPassword,signOut,updateProfile} from "firebase/auth";
import {doc,getDoc,serverTimestamp,setDoc} from "firebase/firestore";
import {auth,db} from "./firebase";
import Bootstrap from "./pages/Bootstrap";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import QuotesApplications from "./pages/QuotesApplications";
import Policies from "./pages/Policies";
import Claims from "./pages/Claims";
import SIU from "./pages/SIU";
import Billing from "./pages/Billing";
import Company from "./pages/Company";

const nav=[["Dashboard",LayoutDashboard],["Customers",Users],["Quotes & Applications",ClipboardList],["Policies",FileCheck2],["Claims",ShieldCheck],["SIU",ShieldCheck],["Billing",WalletCards],["Company",Building2]];

function Login(){
  const [mode,setMode]=useState("signin");
  const [form,setForm]=useState({displayName:"",email:"",password:""});
  const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  const update=k=>e=>setForm(v=>({...v,[k]:e.target.value}));

  async function submit(e){
    e.preventDefault(); setLoading(true); setError("");
    try{
      if(mode==="signin"){
        await signInWithEmailAndPassword(auth,form.email,form.password);
      }else{
        const credential=await createUserWithEmailAndPassword(auth,form.email,form.password);
        const bootSnap=await getDoc(doc(db,"system","bootstrap"));
        if(!bootSnap.exists()){
          await deleteUser(credential.user);
          throw new Error("COMPANY_NOT_INITIALIZED");
        }
        await updateProfile(credential.user,{displayName:form.displayName.trim()});
        await setDoc(doc(db,"accounts",credential.user.uid),{
          authUid:credential.user.uid,
          displayName:form.displayName.trim(),
          email:form.email.trim().toLowerCase(),
          accessStatus:"pending",
          createdAt:serverTimestamp()
        });
      }
    }catch(err){
      const code=err?.code||"";
      if(err?.message==="COMPANY_NOT_INITIALIZED")setError("Sterling Mutual must be initialized by the Founder before public registration opens.");
      else if(code.includes("email-already-in-use"))setError("An account already exists with that email.");
      else if(code.includes("weak-password"))setError("Choose a stronger password.");
      else if(code.includes("invalid-credential"))setError("We couldn't sign you in with those credentials.");
      else setError(mode==="signin"?"We couldn't sign you in with those credentials.":"We couldn't create your account.");
    }finally{setLoading(false)}
  }

  return <div className="auth-shell">
    <div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div></div>
    <div className="auth-card">
      <div className="auth-switch"><button className={mode==="signin"?"active":""} onClick={()=>{setMode("signin");setError("")}}>Sign in</button><button className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setError("")}}>Create account</button></div>
      <div className="eyebrow">{mode==="signin"?"SECURE STAFF ACCESS":"STERLING MUTUAL ACCOUNT"}</div>
      <h1>{mode==="signin"?"Welcome back.":"Create your account."}</h1>
      <p>{mode==="signin"?"Sign in to the Sterling Mutual operations platform.":"Registration does not grant staff access. An authorized administrator must assign your role or permissions before you can use company systems."}</p>
      <form onSubmit={submit} className="form-stack">
        {mode==="signup"&&<label>Full name<input value={form.displayName} onChange={update("displayName")} required/></label>}
        <label>Email<input type="email" value={form.email} onChange={update("email")} required/></label>
        <label>Password<input type="password" minLength="8" value={form.password} onChange={update("password")} required/></label>
        {error&&<div className="error-box">{error}</div>}
        <button className="primary" disabled={loading}>{loading?(mode==="signin"?"Signing in…":"Creating account…"):(mode==="signin"?"Sign in":"Create account")}</button>
      </form>
      {mode==="signup"&&<div className="account-warning"><ShieldCheck size={17}/><span>New accounts start with <strong>no operational permissions</strong>.</span></div>}
    </div>
    <div className="auth-footer">Sterling Mutual Insurance • Internal Operations</div>
  </div>
}

export default function App(){
  const [user,setUser]=useState(null),[staff,setStaff]=useState(null),[account,setAccount]=useState(null),[bootstrapState,setBootstrapState]=useState(null),[loading,setLoading]=useState(true);
  const [page,setPage]=useState("Dashboard"),[mobileOpen,setMobileOpen]=useState(false);

  async function refreshAccess(u){
    if(!u){setStaff(null);setAccount(null);setBootstrapState(null);return}
    const [staffSnap,accountSnap,bootSnap]=await Promise.all([
      getDoc(doc(db,"staff",u.uid)),
      getDoc(doc(db,"accounts",u.uid)),
      getDoc(doc(db,"system","bootstrap"))
    ]);
    setStaff(staffSnap.exists()?{id:staffSnap.id,...staffSnap.data()}:null);
    setAccount(accountSnap.exists()?{id:accountSnap.id,...accountSnap.data()}:null);
    setBootstrapState(bootSnap.exists()?bootSnap.data():null);
  }

  useEffect(()=>onAuthStateChanged(auth,async u=>{
    setUser(u); setStaff(null); setAccount(null); setBootstrapState(null);
    if(u)await refreshAccess(u);
    setLoading(false);
  }),[]);

  const initials=useMemo(()=>staff?.displayName?.split(" ").map(x=>x[0]).slice(0,2).join("")||"SM",[staff]);

  if(loading)return <div className="splash"><div className="brand-mark large">SM</div><span>Loading Sterling Mutual…</span></div>;
  if(!user)return <Login/>;
  if(!staff&&!bootstrapState&&!account)return <Bootstrap user={user} onComplete={()=>refreshAccess(user)} onSignOut={()=>signOut(auth)}/>;
  if(!staff)return <div className="auth-shell"><div className="auth-card pending-card">
    <div className="pending-icon"><ShieldCheck size={28}/></div>
    <div className="eyebrow">ACCOUNT CREATED</div>
    <h1>Staff access pending.</h1>
    <p>Your Sterling Mutual account is active, but it currently has no staff role or operational permissions.</p>
    <div className="pending-details"><div><span>Account</span><strong>{account?.displayName||user.displayName||user.email}</strong></div><div><span>Status</span><strong>Awaiting staff assignment</strong></div></div>
    <p className="pending-help">A Sterling Mutual administrator must assign your role before company data becomes available.</p>
    <button className="primary" onClick={()=>signOut(auth)}>Sign out</button>
  </div></div>;

  return <div className="app-shell">
    <aside className={mobileOpen?"sidebar open":"sidebar"}>
      <div className="sidebar-brand"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div><button className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={20}/></button></div>
      <nav>{nav.map(([name,Icon])=><button key={name} className={page===name?"nav-item active":"nav-item"} onClick={()=>{setPage(name);setMobileOpen(false)}}><Icon size={18}/><span>{name}</span></button>)}</nav>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div><strong>{staff.displayName}</strong><span>{staff.title}</span></div><button title="Sign out" onClick={()=>signOut(auth)}><LogOut size={18}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div className="search"><Search size={17}/><input placeholder="Search customers, policies, claims…"/></div><div className="environment"><span></span> LIVE OPERATIONS</div></header>
      {page==="Dashboard"&&<Dashboard staff={staff}/>}
      {page==="Customers"&&<Customers staff={staff}/>}
      {page==="Quotes & Applications"&&<QuotesApplications staff={staff}/>}
      {page==="Policies"&&<Policies staff={staff}/>}
      {page==="Claims"&&<Claims staff={staff}/>}
      {page==="SIU"&&<SIU staff={staff}/>}
      {page==="Billing"&&<Billing staff={staff}/>}
      {page==="Company"&&<Company staff={staff}/>}
      {!["Dashboard","Customers","Quotes & Applications","Policies","Claims","SIU","Billing","Company"].includes(page)&&<section className="content"><div className="page-heading"><div><div className="eyebrow">COMING IN PART 3–4</div><h1>{page}</h1><p>This workspace is reserved for the next build phase.</p></div></div><div className="empty-state"><ShieldCheck size={30}/><h3>{page} is ready for its engine.</h3><p>The foundation, permissions and layout are already in place.</p></div></section>}
    </main>
  </div>
}
