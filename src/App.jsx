import {useEffect,useMemo,useRef,useState} from "react";
import {Bell,Building2,CalendarDays,ChevronDown,ClipboardList,FileCheck2,LayoutDashboard,LogOut,Menu,Plus,Search,ShieldCheck,Users,WalletCards,UsersRound,X} from "lucide-react";
import {createUserWithEmailAndPassword,deleteUser,onAuthStateChanged,signInWithEmailAndPassword,signOut,updateProfile} from "firebase/auth";
import {collection,doc,getDoc,getDocs,serverTimestamp,setDoc} from "firebase/firestore";
import {auth,db} from "./firebase";
import Bootstrap from "./pages/Bootstrap";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import WalkIns from "./pages/WalkIns";
import QuotesApplications from "./pages/QuotesApplications";
import Policies from "./pages/Policies";
import Claims from "./pages/Claims";
import SIU from "./pages/SIU";
import Billing from "./pages/Billing";
import Cancellations from "./pages/Cancellations";
import Company from "./pages/Company";
import CustomerPortal from "./pages/CustomerPortal";
import CustomerWorkspace from "./pages/CustomerWorkspace";
import Appointments from "./pages/Appointments";
import MyWork from "./pages/MyWork";
import {can,PERMISSIONS} from "./permissions";

const navGroups=[
  ["WORK",[["Dashboard",LayoutDashboard,null],["My Work",Bell,null]]],
  ["FRONT OFFICE",[["Appointments",CalendarDays,PERMISSIONS.APPOINTMENT_READ],["Walk-ins",UsersRound,PERMISSIONS.WALKIN_READ],["Customers",Users,PERMISSIONS.CUSTOMER_READ],["Quotes & Applications",ClipboardList,PERMISSIONS.QUOTE_READ]]],
  ["COVERAGE & SERVICE",[["Policies",FileCheck2,PERMISSIONS.POLICY_READ],["Cancellations",ShieldCheck,PERMISSIONS.POLICY_READ],["Claims",ShieldCheck,PERMISSIONS.CLAIM_READ],["SIU",ShieldCheck,PERMISSIONS.SIU_READ],["Billing",WalletCards,PERMISSIONS.BILLING_READ]]],
  ["MANAGEMENT",[["Company",Building2,null]]]
];

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
  const [user,setUser]=useState(null),[staff,setStaff]=useState(null),[account,setAccount]=useState(null),[customerAccount,setCustomerAccount]=useState(null),[bootstrapState,setBootstrapState]=useState(null),[loading,setLoading]=useState(true);
  const [page,setPage]=useState("Dashboard"),[pageContext,setPageContext]=useState(null),[mobileOpen,setMobileOpen]=useState(false);
  const [finder,setFinder]=useState(""),[newOpen,setNewOpen]=useState(false),[notifOpen,setNotifOpen]=useState(false),[searchRecords,setSearchRecords]=useState([]),[opsData,setOpsData]=useState({walkIns:[],quotes:[],claims:[],policies:[],serviceRequests:[],approvals:[]}),[recentCustomers,setRecentCustomers]=useState([]),[favoriteCustomers,setFavoriteCustomers]=useState([]);
  const searchRef=useRef(null);
  const refreshShortcuts=()=>{
    try{
      setRecentCustomers(JSON.parse(localStorage.getItem("smi-recent-customers")||"[]"));
      setFavoriteCustomers(JSON.parse(localStorage.getItem("smi-favorite-customers")||"[]"));
    }catch{}
  };
  const navigate=(name,context=null)=>{refreshShortcuts();setPage(name);setPageContext(context);setMobileOpen(false);setFinder("");setNewOpen(false)};
  const visibleNavGroups=navGroups.map(([group,items])=>[group,items.filter(([, ,permission])=>!permission||can(staff,permission))]).filter(([,items])=>items.length);
  const allNav=visibleNavGroups.flatMap(([,items])=>items);
  const finderMatches=finder.trim()?allNav.filter(([name])=>name.toLowerCase().includes(finder.toLowerCase())).slice(0,5):[];
  const recordMatches=finder.trim()?searchRecords.filter(r=>r.searchText.includes(finder.toLowerCase())).slice(0,7):[];
  const notifications=[
    ...opsData.walkIns.filter(x=>x.status==="waiting"&&can(staff,PERMISSIONS.WALKIN_READ)).map(x=>({title:x.displayName,detail:"Waiting in lobby",page:"Walk-ins"})),
    ...opsData.quotes.filter(x=>x.status==="submitted"&&can(staff,PERMISSIONS.UNDERWRITING_REVIEW)).map(x=>({title:x.customerName,detail:"Application awaiting underwriting",page:"Quotes & Applications",context:{customerId:x.customerId}})),
    ...opsData.claims.filter(x=>x.coverageStatus==="pending"&&can(staff,PERMISSIONS.CLAIM_READ)).map(x=>({title:x.claimNumber,detail:"Coverage decision pending",page:"Claims",context:{customerId:x.customerId}})),
    ...opsData.policies.filter(x=>x.status==="renewal_pending"&&can(staff,PERMISSIONS.POLICY_READ)).map(x=>({title:x.policyNumber,detail:"Renewal offer pending",page:"Policies",context:{customerId:x.customerId}})),
    ...opsData.serviceRequests.filter(x=>x.status==="submitted"&&can(staff,PERMISSIONS.SERVICE_REQUEST_READ)).map(x=>({title:x.customerName||"Customer request",detail:String(x.type||"service request").replaceAll("_"," "),page:"Customer Workspace",context:{customerId:x.customerId}})),
    ...opsData.approvals.filter(x=>x.status==="pending"&&can(staff,PERMISSIONS.APPROVAL_READ)).map(x=>({title:x.title||"Approval required",detail:x.summary||x.actionType,page:"Company"}))
  ].slice(0,12);

  useEffect(()=>{
    if(!staff)return;
    const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchRef.current?.focus()}};
    window.addEventListener("keydown",key);
    (async()=>{
      const safe=async n=>{try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}};
      const [customers,policies,claims,quotes,walkIns,serviceRequests,approvals]=await Promise.all(["customers","policies","claims","quotes","walkIns","serviceRequests","approvals"].map(safe));
      setSearchRecords([
        ...customers.map(x=>({type:"Customer",label:x.displayName||x.email||"Customer",sub:x.email||x.phone||"",searchText:[x.displayName,x.email,x.phone].filter(Boolean).join(" ").toLowerCase(),page:"Customer Workspace",context:{customerId:x.id}})),
        ...policies.map(x=>({type:"Policy",label:x.policyNumber,sub:x.customerName||"",searchText:[x.policyNumber,x.customerName].filter(Boolean).join(" ").toLowerCase(),page:"Policies",context:{customerId:x.customerId}})),
        ...claims.map(x=>({type:"Claim",label:x.claimNumber,sub:x.customerName||"",searchText:[x.claimNumber,x.customerName,x.policyNumber].filter(Boolean).join(" ").toLowerCase(),page:"Claims",context:{customerId:x.customerId}})),
        ...quotes.map(x=>({type:"Quote",label:x.quoteNumber,sub:x.customerName||"",searchText:[x.quoteNumber,x.customerName].filter(Boolean).join(" ").toLowerCase(),page:"Quotes & Applications",context:{customerId:x.customerId}}))
      ]);
      setOpsData({walkIns,quotes,claims,policies,serviceRequests,approvals});
    })();
    return()=>window.removeEventListener("keydown",key);
  },[staff]);

  async function refreshAccess(u){
    if(!u){setStaff(null);setAccount(null);setCustomerAccount(null);setBootstrapState(null);return}
    const [staffSnap,accountSnap,customerAccountSnap,bootSnap]=await Promise.all([
      getDoc(doc(db,"staff",u.uid)),
      getDoc(doc(db,"accounts",u.uid)),
      getDoc(doc(db,"customerAccounts",u.uid)),
      getDoc(doc(db,"system","bootstrap"))
    ]);
    setStaff(staffSnap.exists()?{id:staffSnap.id,...staffSnap.data()}:null);
    setAccount(accountSnap.exists()?{id:accountSnap.id,...accountSnap.data()}:null);
    setCustomerAccount(customerAccountSnap.exists()?{id:customerAccountSnap.id,...customerAccountSnap.data()}:null);
    setBootstrapState(bootSnap.exists()?bootSnap.data():null);
  }

  useEffect(()=>{refreshShortcuts()},[]);

  useEffect(()=>onAuthStateChanged(auth,async u=>{
    setUser(u); setStaff(null); setAccount(null); setCustomerAccount(null); setBootstrapState(null);
    if(u)await refreshAccess(u);
    setLoading(false);
  }),[]);

  const initials=useMemo(()=>staff?.displayName?.split(" ").map(x=>x[0]).slice(0,2).join("")||"SM",[staff]);

  if(loading)return <div className="splash"><div className="brand-mark large">SM</div><span>Loading Sterling Mutual…</span></div>;
  if(!user)return <Login/>;
  if(customerAccount&&!staff)return <CustomerPortal user={user} customerAccount={customerAccount} onSignOut={()=>signOut(auth)}/>;
  if(!staff&&!bootstrapState&&!account&&!customerAccount)return <Bootstrap user={user} onComplete={()=>refreshAccess(user)} onSignOut={()=>signOut(auth)}/>;
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
      <nav>{visibleNavGroups.map(([group,items])=><div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{items.map(([name,Icon])=><button key={name} className={page===name?"nav-item active":"nav-item"} onClick={()=>navigate(name)}><Icon size={18}/><span>{name}</span></button>)}</div>)}
        {(favoriteCustomers.length>0||recentCustomers.length>0)&&<div className="sidebar-shortcuts">
          {favoriteCustomers.length>0&&<div className="nav-group"><div className="nav-group-label">FAVORITES</div>{favoriteCustomers.slice(0,4).map(x=><button className="shortcut-item" key={"f"+x.id} onClick={()=>navigate("Customer Workspace",{customerId:x.id})}><span>★</span><b>{x.name}</b></button>)}</div>}
          {recentCustomers.length>0&&<div className="nav-group"><div className="nav-group-label">RECENT</div>{recentCustomers.slice(0,4).map(x=><button className="shortcut-item" key={"r"+x.id} onClick={()=>navigate("Customer Workspace",{customerId:x.id})}><span>↗</span><b>{x.name}</b></button>)}</div>}
        </div>}
      </nav>
      <div className="sidebar-user"><div className="avatar">{initials}</div><div><strong>{staff.displayName}</strong><span>{staff.title}</span></div><button title="Sign out" onClick={()=>signOut(auth)}><LogOut size={18}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button>
        <div className="topbar-page"><span>{pageContext?.customerId?(searchRecords.find(r=>r.type==="Customer"&&r.context?.customerId===pageContext.customerId)?.label||"Customer")+" → Sterling Mutual":"Sterling Mutual"}</span><strong>{page}</strong></div>
        <div className="command-search">
          <Search size={16}/>
          <input ref={searchRef} value={finder} onChange={e=>setFinder(e.target.value)} placeholder="Search customers, policy #, claim #…  Ctrl+K"/>
          {(finderMatches.length>0||recordMatches.length>0)&&<div className="command-results">{finderMatches.length>0&&<div className="command-result-group"><small>WORKSPACES</small>{finderMatches.map(([name,Icon])=><button key={name} onClick={()=>navigate(name)}><Icon size={15}/><span>{name}</span></button>)}</div>}{recordMatches.length>0&&<div className="command-result-group"><small>RECORDS</small>{recordMatches.map((r,i)=><button key={i} onClick={()=>navigate(r.page,r.context)}><Search size={14}/><span><strong>{r.label}</strong><small>{r.type} • {r.sub}</small></span></button>)}</div>}</div>}
        </div>
        <div className="notification-wrap">
          <button className="notification-button" onClick={()=>setNotifOpen(v=>!v)}><Bell size={18}/>{notifications.length>0&&<span>{notifications.length}</span>}</button>
          {notifOpen&&<div className="notification-menu"><div className="notification-head"><strong>Notifications</strong><span>{notifications.length}</span></div>{notifications.length===0?<div className="empty-state compact-empty">Nothing needs your attention.</div>:notifications.map((n,i)=><button key={i} onClick={()=>{navigate(n.page,n.context);setNotifOpen(false)}}><Bell size={15}/><span><strong>{n.title}</strong><small>{n.detail}</small></span></button>)}</div>}
        </div>
        <div className="new-menu-wrap">
          <button className="primary compact topbar-new" onClick={()=>setNewOpen(v=>!v)}><Plus size={16}/> New <ChevronDown size={14}/></button>
          {newOpen&&<div className="new-menu">
            {can(staff,PERMISSIONS.APPOINTMENT_MANAGE)&&<button onClick={()=>navigate("Appointments",{openNew:true})}><CalendarDays size={16}/><span><strong>Appointment</strong><small>Schedule a customer visit</small></span></button>}{can(staff,PERMISSIONS.WALKIN_CREATE)&&<button onClick={()=>navigate("Walk-ins",{openNew:true})}><UsersRound size={16}/><span><strong>Walk-in</strong><small>Check someone into the lobby</small></span></button>}
            {can(staff,PERMISSIONS.CUSTOMER_CREATE)&&<button onClick={()=>navigate("Customers",{openNew:true})}><Users size={16}/><span><strong>Customer</strong><small>Create a customer record</small></span></button>}
            {can(staff,PERMISSIONS.QUOTE_CREATE)&&<button onClick={()=>navigate("Quotes & Applications",{openNew:true})}><ClipboardList size={16}/><span><strong>Quote</strong><small>Start new business</small></span></button>}
            {can(staff,PERMISSIONS.CLAIM_CREATE_FOR_CUSTOMER)&&<button onClick={()=>navigate("Claims",{openNew:true})}><ShieldCheck size={16}/><span><strong>Claim</strong><small>File first notice of loss</small></span></button>}
          </div>}
        </div>
        <div className="environment"><span></span> LIVE</div>
      </header>
      {page==="Dashboard"&&<Dashboard staff={staff} onNavigate={navigate}/>}      {page==="My Work"&&<MyWork staff={staff} onNavigate={navigate}/>}      {page==="Appointments"&&<Appointments staff={staff} onNavigate={navigate} openNew={pageContext?.openNew}/>}
      {page==="Walk-ins"&&<WalkIns staff={staff} onNavigate={navigate} openNew={pageContext?.openNew}/>}
      {page==="Customers"&&<Customers staff={staff} onNavigate={navigate} openNew={pageContext?.openNew}/>}      {page==="Customer Workspace"&&<CustomerWorkspace staff={staff} customerId={pageContext?.customerId} onNavigate={navigate}/>}
      {page==="Quotes & Applications"&&<QuotesApplications staff={staff} initialCustomerId={pageContext?.customerId} openNew={pageContext?.openNew}/>}
      {page==="Policies"&&<Policies staff={staff} onNavigate={navigate} initialCustomerId={pageContext?.customerId}/>}      {page==="Cancellations"&&<Cancellations staff={staff} onNavigate={navigate}/>}
      {page==="Claims"&&<Claims staff={staff} initialCustomerId={pageContext?.customerId} openNew={pageContext?.openNew}/>}
      {page==="SIU"&&<SIU staff={staff}/>}
      {page==="Billing"&&<Billing staff={staff} initialPolicyId={pageContext?.policyId}/>}
      {page==="Company"&&<Company staff={staff}/>}
      {!["Dashboard","My Work","Appointments","Walk-ins","Customers","Customer Workspace","Quotes & Applications","Policies","Cancellations","Claims","SIU","Billing","Company"].includes(page)&&<section className="content"><div className="page-heading"><div><div className="eyebrow">COMING IN PART 3–4</div><h1>{page}</h1><p>This workspace is reserved for the next build phase.</p></div></div><div className="empty-state"><ShieldCheck size={30}/><h3>{page} is ready for its engine.</h3><p>The foundation, permissions and layout are already in place.</p></div></section>}
    </main>
  </div>
}
