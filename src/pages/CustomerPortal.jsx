import {useEffect,useState} from "react";
import {collection,doc,getDoc,getDocs,query,where} from "firebase/firestore";
import {FileCheck2,LogOut,ShieldAlert} from "lucide-react";
import {db} from "../firebase";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));

export default function CustomerPortal({user,customerAccount,onSignOut}){
  const [customer,setCustomer]=useState(null),[policies,setPolicies]=useState([]),[claims,setClaims]=useState([]),[loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      try{
        const customerId=customerAccount.customerId;
        const [cSnap,pSnap,clSnap]=await Promise.all([
          getDoc(doc(db,"customers",customerId)),
          getDocs(query(collection(db,"policies"),where("customerId","==",customerId))),
          getDocs(query(collection(db,"claims"),where("customerId","==",customerId)))
        ]);
        if(cSnap.exists())setCustomer({id:cSnap.id,...cSnap.data()});
        setPolicies(pSnap.docs.map(d=>({id:d.id,...d.data()})));
        setClaims(clSnap.docs.map(d=>({id:d.id,...d.data()})));
      }finally{setLoading(false)}
    })();
  },[customerAccount.customerId]);

  if(loading)return <div className="splash"><div className="brand-mark large">SM</div><span>Opening your account…</span></div>;

  return <div className="customer-portal-shell">
    <header className="customer-portal-header">
      <div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Customer Account</span></div></div>
      <button className="secondary compact" onClick={onSignOut}><LogOut size={15}/> Sign out</button>
    </header>
    <main className="customer-portal-main">
      <section className="customer-welcome">
        <div className="eyebrow">MY STERLING MUTUAL</div>
        <h1>Welcome, {customer?.firstName||customer?.displayName||user.displayName||"Customer"}.</h1>
        <p>View your Sterling Mutual policy and claim information in one place.</p>
      </section>

      <div className="record-summary customer-account-summary">
        <div><span>Customer</span><strong>{customer?.displayName||customerAccount.displayName}</strong></div>
        <div><span>Email</span><strong>{customerAccount.email||customer?.email||user.email}</strong></div>
        <div><span>Policies</span><strong>{policies.length}</strong></div>
        <div><span>Claims</span><strong>{claims.length}</strong></div>
      </div>

      <div className="customer-portal-grid">
        <section className="table-card">
          <div className="table-toolbar"><strong>My policies</strong><span>{policies.length}</span></div>
          {policies.length===0?<div className="empty-state compact-empty"><FileCheck2 size={26}/><h3>No policies yet.</h3></div>:
          <div className="portal-record-list">{policies.map(p=><div key={p.id}><FileCheck2 size={18}/><div><strong>{p.policyNumber}</strong><span>{p.product?.toUpperCase()} • {p.status}</span></div><div><strong>{money(p.monthlyPremium)}/mo</strong><span>{p.effectiveDate} → {p.expirationDate}</span></div></div>)}</div>}
        </section>
        <section className="table-card">
          <div className="table-toolbar"><strong>My claims</strong><span>{claims.length}</span></div>
          {claims.length===0?<div className="empty-state compact-empty"><ShieldAlert size={26}/><h3>No claims on file.</h3></div>:
          <div className="portal-record-list">{claims.map(c=><div key={c.id}><ShieldAlert size={18}/><div><strong>{c.claimNumber}</strong><span>{c.lossType} • {c.status}</span></div><div><strong>{money(c.claimedAmount)}</strong><span>Coverage: {c.coverageStatus}</span></div></div>)}</div>}
        </section>
      </div>
    </main>
  </div>
}
