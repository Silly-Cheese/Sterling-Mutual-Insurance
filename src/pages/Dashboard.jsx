import {useEffect,useState} from "react";
import {collection,getDocs} from "firebase/firestore";
import {ArrowRight,BadgeDollarSign,ClipboardCheck,FileText,ShieldAlert,Users} from "lucide-react";
import {db} from "../firebase";

export default function Dashboard({staff}){
  const [stats,setStats]=useState({customers:0,applications:0,policies:0,claims:0,reserves:0});
  const [queue,setQueue]=useState([]);

  useEffect(()=>{
    (async()=>{
      const safe=async name=>{try{return (await getDocs(collection(db,name))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}};
      const [customers,quotes,policies,claims]=await Promise.all([safe("customers"),safe("quotes"),safe("policies"),safe("claims")]);
      setStats({
        customers:customers.length,
        applications:quotes.filter(q=>q.status==="submitted"||q.status==="needs_information"||q.status==="approved").length,
        policies:policies.filter(p=>p.status==="active").length,
        claims:claims.filter(c=>!["closed","denied"].includes(c.status)).length,
        reserves:claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0)
      });
      const items=[];
      quotes.filter(q=>q.status==="submitted").slice(0,3).forEach(q=>items.push({title:q.customerName,detail:"Application awaiting underwriting",type:"APPLICATION"}));
      claims.filter(c=>c.coverageStatus==="pending").slice(0,3).forEach(c=>items.push({title:c.claimNumber,detail:"Coverage decision pending",type:"CLAIM"}));
      setQueue(items.slice(0,5));
    })();
  },[]);

  const cards=[
    ["Customers",stats.customers,"Customer records",Users],
    ["Open applications",stats.applications,"Active underwriting pipeline",ClipboardCheck],
    ["Policies in force",stats.policies,"Active coverage",FileText],
    ["Open claims",stats.claims,"Claims inventory",ShieldAlert]
  ];

  return <section className="content">
    <div className="page-heading">
      <div><div className="eyebrow">EXECUTIVE OPERATIONS</div><h1>Good evening, {staff.displayName?.split(" ")[0]}.</h1><p>Sterling Mutual’s operations platform is online.</p></div>
      <div className="secondary"><BadgeDollarSign size={17}/> Claim reserves <span>{"$"+stats.reserves.toLocaleString()}</span></div>
    </div>

    <div className="metric-grid">{cards.map(([label,value,sub,Icon])=><article className="metric-card" key={label}><div className="metric-icon"><Icon size={19}/></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-sub">{sub}</div></article>)}</div>

    <div className="dashboard-grid">
      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">MY WORK</div><h2>Operations queue</h2></div><span className="status-pill">{queue.length?"ACTIVE":"CLEAR"}</span></div>
        {queue.length===0?<div className="queue-empty"><ClipboardCheck size={28}/><h3>No priority work waiting.</h3><p>Submitted applications and pending claim decisions will appear here.</p></div>:
        <div className="dashboard-queue">{queue.map((item,i)=><div key={i}><span className="queue-type">{item.type}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ArrowRight size={15}/></div>)}</div>}
      </article>

      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">SYSTEM</div><h2>Operational status</h2></div></div>
        <div className="status-list"><div><span>Authentication</span><strong>ONLINE</strong></div><div><span>Underwriting engine</span><strong>ONLINE</strong></div><div><span>Claims + SIU</span><strong>ONLINE</strong></div><div><span>Billing + finance</span><strong>ONLINE</strong></div></div>
        <button className="text-action">All four build phases installed <ArrowRight size={15}/></button>
      </article>
    </div>
  </section>
}
