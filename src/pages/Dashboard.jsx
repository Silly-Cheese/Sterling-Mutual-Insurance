import {useEffect,useState} from "react";
import {collection,getDocs} from "firebase/firestore";
import {ArrowRight,BadgeDollarSign,ClipboardCheck,FileText,ShieldAlert,Users,UsersRound,Plus,UserPlus} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

export default function Dashboard({staff,onNavigate}){
  const [stats,setStats]=useState({customers:0,applications:0,policies:0,claims:0,reserves:0,walkIns:0});
  const [queue,setQueue]=useState([]);

  useEffect(()=>{
    (async()=>{
      const safe=async name=>{try{return (await getDocs(collection(db,name))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}};
      const [customers,quotes,policies,claims,walkIns]=await Promise.all([safe("customers"),safe("quotes"),safe("policies"),safe("claims"),safe("walkIns")]);
      const waiting=walkIns.filter(w=>w.status==="waiting");
      setStats({
        customers:customers.length,
        applications:quotes.filter(q=>q.status==="submitted"||q.status==="needs_information"||q.status==="approved").length,
        policies:policies.filter(p=>p.status==="active").length,
        claims:claims.filter(c=>!["closed","denied"].includes(c.status)).length,
        reserves:claims.reduce((s,c)=>s+Number(c.reserveAmount||0),0),
        walkIns:waiting.length
      });
      const items=[];
      waiting.slice(0,3).forEach(w=>items.push({title:w.displayName,detail:"Walk-in waiting • "+(w.reason||"general").replaceAll("_"," "),type:"WALK-IN",page:"Walk-ins"}));
      quotes.filter(q=>q.status==="submitted").slice(0,2).forEach(q=>items.push({title:q.customerName,detail:"Application awaiting underwriting",type:"APPLICATION",page:"Quotes & Applications"}));
      claims.filter(c=>c.coverageStatus==="pending").slice(0,2).forEach(c=>items.push({title:c.claimNumber,detail:"Coverage decision pending",type:"CLAIM",page:"Claims"}));
      setQueue(items.slice(0,6));
    })();
  },[]);

  const cards=[
    ["Walk-ins waiting",stats.walkIns,"Live front-office lobby",UsersRound,"Walk-ins"],
    ["Customers",stats.customers,"Customer relationships",Users,"Customers"],
    ["Open applications",stats.applications,"Underwriting pipeline",ClipboardCheck,"Quotes & Applications"],
    ["Open claims",stats.claims,"Claims inventory",ShieldAlert,"Claims"]
  ];

  return <section className="content dashboard-home">
    <div className="page-heading">
      <div><div className="eyebrow">{(staff.department||"Sterling Mutual").toUpperCase()} OPERATIONS</div><h1>Good evening, {staff.displayName?.split(" ")[0]}.</h1><p>{staff.role==="receptionist"?"Front-office traffic, appointments, and customer arrivals.":staff.department==="Claims"?"Claims inventory, decisions, and exposure requiring attention.":staff.department==="Underwriting"?"Applications, reviews, and policies waiting to bind.":"Everything that needs your attention today, in one place."}</p></div>
      <div className="secondary"><BadgeDollarSign size={17}/> Claim reserves <span>{"$"+stats.reserves.toLocaleString()}</span></div>
    </div>

    <div className="quick-actions">
      {can(staff,PERMISSIONS.WALKIN_READ)&&<button onClick={()=>onNavigate?.("Walk-ins")}><span className="quick-icon"><UsersRound size={18}/></span><span><strong>Front desk</strong><small>Check in or help a walk-in</small></span><ArrowRight size={16}/></button>}
      {can(staff,PERMISSIONS.CUSTOMER_READ)&&<button onClick={()=>onNavigate?.("Customers")}><span className="quick-icon"><UserPlus size={18}/></span><span><strong>Customer records</strong><small>Find and service customers</small></span><ArrowRight size={16}/></button>}
      {can(staff,PERMISSIONS.QUOTE_CREATE)&&<button onClick={()=>onNavigate?.("Quotes & Applications")}><span className="quick-icon"><Plus size={18}/></span><span><strong>Start a quote</strong><small>Move business into underwriting</small></span><ArrowRight size={16}/></button>}
      {can(staff,PERMISSIONS.CLAIM_READ)&&<button onClick={()=>onNavigate?.("Claims")}><span className="quick-icon"><ShieldAlert size={18}/></span><span><strong>Claims</strong><small>Review claim inventory</small></span><ArrowRight size={16}/></button>}
    </div>

    <div className="metric-grid">{cards.map(([label,value,sub,Icon,page])=><button className="metric-card metric-button" key={label} onClick={()=>onNavigate?.(page)}><div className="metric-icon"><Icon size={19}/></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-sub">{sub}</div></button>)}</div>

    <div className="dashboard-grid">
      <article className="panel">
        <div className="panel-head"><div><div className="eyebrow">PRIORITY QUEUE</div><h2>What needs attention</h2></div><span className="status-pill">{queue.length?"ACTIVE":"CLEAR"}</span></div>
        {queue.length===0?<div className="queue-empty"><ClipboardCheck size={28}/><h3>Nothing urgent is waiting.</h3><p>Walk-ins, submitted applications, and pending claim decisions will surface here.</p></div>:
        <div className="dashboard-queue">{queue.map((item,i)=><button key={i} onClick={()=>onNavigate?.(item.page)}><span className="queue-type">{item.type}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ArrowRight size={15}/></button>)}</div>}
      </article>

      <article className="panel operating-snapshot">
        <div className="panel-head"><div><div className="eyebrow">TODAY'S BOOK</div><h2>Operating snapshot</h2></div></div>
        <div className="status-list">
          <div><span>Walk-ins waiting</span><strong>{stats.walkIns}</strong></div>
          <div><span>Applications in motion</span><strong>{stats.applications}</strong></div>
          <div><span>Policies in force</span><strong>{stats.policies}</strong></div>
          <div><span>Open claims</span><strong>{stats.claims}</strong></div>
        </div>
        <button className="text-action" onClick={()=>onNavigate?.("Company")}>Open company operations <ArrowRight size={15}/></button>
      </article>
    </div>
  </section>
}
