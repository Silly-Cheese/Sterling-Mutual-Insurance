import {useEffect,useMemo,useState} from "react";
import {collection,getDocs} from "firebase/firestore";
import {AlertTriangle,ArrowRight,Bell,CalendarDays,ClipboardCheck,CreditCard,FileCheck2,ShieldAlert,UsersRound} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const today=()=>new Date().toISOString().slice(0,10);
const ageDays=ts=>ts?.toDate?Math.max(0,Math.floor((Date.now()-ts.toDate().getTime())/86400000)):0;
const daysFrom=date=>date?Math.ceil((new Date(date+"T23:59:59")-new Date())/86400000):null;

export default function MyWork({staff,onNavigate}){
  const [data,setData]=useState({walkIns:[],appointments:[],quotes:[],policies:[],claims:[],serviceRequests:[],approvals:[],invoices:[],cancellations:[],contacts:[]});
  const [filter,setFilter]=useState("all");

  useEffect(()=>{(async()=>{
    const safe=async n=>{try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}};
    const [walkIns,appointments,quotes,policies,claims,serviceRequests,approvals,invoices,cancellations,contacts]=await Promise.all(["walkIns","appointments","quotes","policies","claims","serviceRequests","approvals","billingInvoices","policyCancellations","claimContacts"].map(safe));
    setData({walkIns,appointments,quotes,policies,claims,serviceRequests,approvals,invoices,cancellations,contacts});
  })()},[]);

  const items=useMemo(()=>{
    const out=[];
    if(can(staff,PERMISSIONS.WALKIN_READ))data.walkIns.filter(x=>x.status==="waiting"||x.assignedTo===staff.id).forEach(x=>out.push({priority:x.priority==="urgent"?1:2,type:"Front Office",title:x.displayName,detail:x.status==="waiting"?"Waiting in lobby":"Assigned to you",aging:"Waiting now",page:"Walk-ins",Icon:UsersRound}));
    if(can(staff,PERMISSIONS.APPOINTMENT_READ))data.appointments.filter(x=>x.date===today()&&!["completed","cancelled"].includes(x.status)).forEach(x=>out.push({priority:2,type:"Front Office",title:x.customerName,detail:(x.time||"")+" • "+x.department,aging:"Today",page:"Appointments",Icon:CalendarDays}));
    if(can(staff,PERMISSIONS.UNDERWRITING_REVIEW))data.quotes.filter(x=>x.status==="submitted").forEach(x=>out.push({priority:ageDays(x.submittedAt||x.createdAt)>=3?1:2,type:"Underwriting",title:x.customerName,detail:"Application awaiting review",aging:ageDays(x.submittedAt||x.createdAt)+" days waiting",page:"Quotes & Applications",context:{customerId:x.customerId},Icon:ClipboardCheck}));
    if(can(staff,PERMISSIONS.POLICY_RENEW)){const horizon=new Date();horizon.setDate(horizon.getDate()+30);const h=horizon.toISOString().slice(0,10);data.policies.filter(x=>x.status==="active"&&x.expirationDate&&x.expirationDate<=h).forEach(x=>{const days=daysFrom(x.expirationDate);out.push({priority:days!==null&&days<=10?1:2,type:"Renewal",title:x.customerName,detail:x.policyNumber+" expires "+x.expirationDate,aging:days+" days remaining",page:"Policies",context:{customerId:x.customerId},Icon:FileCheck2})})}
    if(can(staff,PERMISSIONS.CLAIM_READ))data.claims.filter(x=>x.assignedTo===staff.id||(!x.assignedTo&&x.coverageStatus==="pending")).forEach(x=>{
      const last=data.contacts.filter(c=>c.claimId===x.id).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0];
      const days=last?ageDays(last.createdAt):ageDays(x.createdAt);
      out.push({priority:x.priority==="high"||days>=7?1:2,type:"Claims",title:x.claimNumber,detail:x.assignedTo===staff.id?"Assigned to you":"Coverage decision pending",aging:days+" days since "+(last?"contact":"opening"),page:"Claims",context:{customerId:x.customerId},Icon:ShieldAlert});
    });
    if(can(staff,PERMISSIONS.BILLING_READ))data.invoices.filter(i=>!["paid","void"].includes(i.status)&&i.dueDate<today()).forEach(i=>{const days=Math.abs(daysFrom(i.dueDate)||0);out.push({priority:days>=10?1:2,type:"Billing Risk",title:i.customerName||i.policyNumber,detail:i.policyNumber+" • past-due invoice",aging:days+" days past due",page:"Billing",context:{policyId:i.policyId},Icon:CreditCard})});
    if(can(staff,PERMISSIONS.POLICY_READ))data.cancellations.filter(c=>c.status==="open").forEach(c=>{const days=daysFrom(c.effectiveDate);out.push({priority:days!==null&&days<=5?1:2,type:"Cancellation",title:c.customerName,detail:c.policyNumber+" • "+String(c.stage).replaceAll("_"," "),aging:days===null?"No effective date":days<0?Math.abs(days)+" days overdue":days+" days to effective",page:"Cancellations",Icon:AlertTriangle})});
    if(can(staff,PERMISSIONS.SERVICE_REQUEST_READ))data.serviceRequests.filter(x=>["submitted","in_review"].includes(x.status)).forEach(x=>out.push({priority:ageDays(x.createdAt)>=3?1:2,type:"Service",title:x.customerName||x.type,detail:(x.type||"request").replaceAll("_"," "),aging:ageDays(x.createdAt)+" days open",page:"Customer Workspace",context:{customerId:x.customerId},Icon:Bell}));
    if(can(staff,PERMISSIONS.APPROVAL_READ))data.approvals.filter(x=>x.status==="pending").forEach(x=>out.push({priority:1,type:"Approvals",title:x.title||x.actionType,detail:x.summary||"Approval required",aging:ageDays(x.createdAt)+" days waiting",page:"Company",Icon:AlertTriangle}));
    return out.sort((a,b)=>a.priority-b.priority||String(b.aging).localeCompare(String(a.aging)));
  },[data,staff]);

  const filters=["all","priority","Claims","Billing Risk","Cancellation","Underwriting","Renewal","Service","Approvals","Front Office"];
  const shown=items.filter(i=>filter==="all"||filter==="priority"&&i.priority===1||i.type===filter);
  const counts={urgent:items.filter(x=>x.priority===1).length,total:items.length,claims:items.filter(x=>x.type==="Claims").length,approvals:items.filter(x=>x.type==="Approvals").length};

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow">PERSONAL OPERATIONS</div><h1>My Work</h1><p>Generated automatically from live records, aging, deadlines, delinquency, and assigned work—never manually-created tasks.</p></div></div>
    <div className="metric-grid"><article className="metric-card"><div className="metric-value">{counts.total}</div><div className="metric-label">Items requiring attention</div></article><article className="metric-card"><div className="metric-value">{counts.urgent}</div><div className="metric-label">Priority / aging</div></article><article className="metric-card"><div className="metric-value">{counts.claims}</div><div className="metric-label">Claims work</div></article><article className="metric-card"><div className="metric-value">{counts.approvals}</div><div className="metric-label">Approvals</div></article></div>
    <div className="work-filters">{filters.map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <div className="table-card work-center"><div className="table-toolbar"><strong>Attention queue</strong><span>{shown.length} items</span></div>{shown.length===0?<div className="empty-state"><ClipboardCheck size={30}/><h3>You're caught up in this view.</h3></div>:<div className="work-list">{shown.map((item,i)=><button key={i} onClick={()=>onNavigate?.(item.page,item.context)} className={item.priority===1?"priority":""}><div className="work-icon"><item.Icon size={17}/></div><div><strong>{item.title}</strong><span>{item.type} • {item.detail}</span><small>{item.aging}</small></div><ArrowRight size={15}/></button>)}</div>}</div>
  </section>
}
