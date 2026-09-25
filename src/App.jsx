import {useEffect,useMemo,useState} from "react";
import {Building2,ClipboardList,FileCheck2,LayoutDashboard,LogOut,Menu,Search,ShieldCheck,Users,WalletCards,X} from "lucide-react";
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from "firebase/auth";
import {doc,getDoc} from "firebase/firestore";
import {auth,db} from "./firebase";
import Bootstrap from "./pages/Bootstrap";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import QuotesApplications from "./pages/QuotesApplications";
import Policies from "./pages/Policies";
import Claims from "./pages/Claims";

const nav=[["Dashboard",LayoutDashboard],["Customers",Users],["Quotes & Applications",ClipboardList],["Policies",FileCheck2],["Claims",ShieldCheck],["Billing",WalletCards],["Company",Building2]];

function Login({onBootstrap}){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e){
    e.preventDefault(); setLoading(true); setError("");
    try{await signInWithEmailAndPassword(auth,email,password)}
    catch{setError("We couldn't sign you in with those credentials.")}
    finally{setLoading(false)}
  }
  return <div className="auth-shell">
    <div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div></div>
    <div className="auth-card">
      <div className="eyebrow">SECURE STAFF ACCESS</div><h1>Welcome back.</h1>
      <p>Sign in to the Sterling Mutual operations platform.</p>
      <form onSubmit={submit} className="form-stack">
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        {error&&<div className="error-box">{error}</div>}
        <button className="primary" disabled={loading}>{loading?"Signing in…":"Sign in"}</button>
      </form>
      <button className="link-button" onClick={onBootstrap}>Initial company setup</button>
    </div>
    <div className="auth-footer">Sterling Mutual Insurance • Internal Operations</div>
  </div>
}

export default function App(){
  const [user,setUser]=useState(null),[staff,setStaff]=useState(null),[loading,setLoading]=useState(true);
  const [bootstrap,setBootstrap]=useState(location.pathname==="/bootstrap"),[page,setPage]=useState("Dashboard"),[mobileOpen,setMobileOpen]=useState(false);

  useEffect(()=>onAuthStateChanged(auth,async u=>{
    setUser(u); setStaff(null);
    if(u){const snap=await getDoc(doc(db,"staff",u.uid)); if(snap.exists())setStaff({id:snap.id,...snap.data()})}
    setLoading(false);
  }),[]);

  const initials=useMemo(()=>staff?.displayName?.split(" ").map(x=>x[0]).slice(0,2).join("")||"SM",[staff]);

  if(loading)return <div className="splash"><div className="brand-mark large">SM</div><span>Loading Sterling Mutual…</span></div>;
  if(bootstrap&&!user)return <Bootstrap onBack={()=>{history.replaceState(null,"","/");setBootstrap(false)}}/>;
  if(!user)return <Login onBootstrap={()=>{history.replaceState(null,"","/bootstrap");setBootstrap(true)}}/>;
  if(!staff)return <div className="auth-shell"><div className="auth-card"><h1>Access pending</h1><p>Your authentication account exists, but no active Sterling Mutual staff profile is attached to it.</p><button className="primary" onClick={()=>signOut(auth)}>Sign out</button></div></div>;

  return <div className="app-shell">
    <aside className={mobileOpen?"sidebar open":"sidebar"}>
      <div className="sidebar-brand"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div><button className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={20}/></button></div>
      <nav>{nav.map(([name,Icon])=><button key={name} className={page===name?"nav-item active":"nav-item"} onClick={()=>{setPage(name);setMobileOpen(false)}}><Icon size={18}/><span>{name}</span>{["Claims","Billing","Company"].includes(name)&&<span className="soon">SOON</span>}</button>)}</nav>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div><strong>{staff.displayName}</strong><span>{staff.title}</span></div><button title="Sign out" onClick={()=>signOut(auth)}><LogOut size={18}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div className="search"><Search size={17}/><input placeholder="Search customers, policies, claims…"/></div><div className="environment"><span></span> LIVE OPERATIONS</div></header>
      {page==="Dashboard"&&<Dashboard staff={staff}/>}
      {page==="Customers"&&<Customers staff={staff}/>}
      {page==="Quotes & Applications"&&<QuotesApplications staff={staff}/>}
      {page==="Policies"&&<Policies staff={staff}/>}
      {!["Dashboard","Customers","Quotes & Applications","Policies"].includes(page)&&<section className="content"><div className="page-heading"><div><div className="eyebrow">COMING IN PART 3–4</div><h1>{page}</h1><p>This workspace is reserved for the next build phase.</p></div></div><div className="empty-state"><ShieldCheck size={30}/><h3>{page} is ready for its engine.</h3><p>The foundation, permissions and layout are already in place.</p></div></section>}
    </main>
  </div>
}
