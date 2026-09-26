import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {BadgeDollarSign,CalendarClock,CheckCircle2,CreditCard,FileText,ReceiptText,RefreshCw,TriangleAlert,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));
const today=()=>new Date().toISOString().slice(0,10);
const addDays=(date,days)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)};
const invoiceNo=()=> "INV-"+new Date().getFullYear()+"-"+Date.now().toString().slice(-7);

export default function Billing({staff,initialPolicyId}){
  const [policies,setPolicies]=useState([]),[tx,setTx]=useState([]),[invoices,setInvoices]=useState([]),[plans,setPlans]=useState([]),[events,setEvents]=useState([]),[selected,setSelected]=useState(null),[selectedCustomer,setSelectedCustomer]=useState(null),[customerTab,setCustomerTab]=useState("overview"),[tab,setTab]=useState("overview");
  const [amount,setAmount]=useState(""),[type,setType]=useState("payment"),[note,setNote]=useState(""),[allocationMode,setAllocationMode]=useState("auto"),[allocationInvoiceId,setAllocationInvoiceId]=useState("");
  const [invoiceForm,setInvoiceForm]=useState({amount:"",dueDate:"",description:"Monthly premium"}),[customerInvoiceForm,setCustomerInvoiceForm]=useState({policyId:"",amount:"",dueDate:"",description:"Monthly premium"});
  const [planForm,setPlanForm]=useState({totalAmount:"",installments:"3",firstDueDate:""}),[editingPlan,setEditingPlan]=useState(null);
  const [delinq,setDelinq]=useState({stage:"current",graceEnds:"",reason:"Nonpayment of premium"});

  async function safe(n){try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch{return []}}
  async function load(){
    const [p,t,i,pl,e]=await Promise.all(["policies","billingTransactions","billingInvoices","paymentPlans","billingEvents"].map(safe));
    setPolicies(p);setTx(t.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setInvoices(i);setPlans(pl);setEvents(e.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    if(selected){const fresh=p.find(x=>x.id===selected.id);if(fresh)setSelected(fresh)}
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialPolicyId&&policies.length){const p=policies.find(x=>x.id===initialPolicyId);if(p)setSelected(p)}},[initialPolicyId,policies]);

  const customerAccounts=useMemo(()=>{
    const map={};
    policies.forEach(p=>{
      if(!map[p.customerId])map[p.customerId]={customerId:p.customerId,customerName:p.customerName,policies:[],openBalance:0,pastDue:0,statuses:new Set()};
      map[p.customerId].policies.push(p);
      map[p.customerId].statuses.add(p.billingStatus||"current");
    });
    Object.values(map).forEach(a=>{
      a.openBalance=invoices.filter(i=>i.customerId===a.customerId&&!["paid","void"].includes(i.status)).reduce((s,i)=>s+Number(i.balanceDue??i.amount??0),0);
      a.pastDue=invoices.filter(i=>i.customerId===a.customerId&&!["paid","void"].includes(i.status)&&i.dueDate<today()).reduce((s,i)=>s+Number(i.balanceDue??i.amount??0),0);
    });
    return Object.values(map);
  },[policies,invoices]);
  const byPolicy=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,tx.filter(t=>t.policyId===p.id)])),[policies,tx]);
  const invoiceByPolicy=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,invoices.filter(i=>i.policyId===p.id).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)))])),[policies,invoices]);
  const planByPolicy=useMemo(()=>Object.fromEntries(policies.map(p=>[p.id,plans.filter(x=>x.policyId===p.id)])),[policies,plans]);

  function ledgerBalance(policy){
    return (byPolicy[policy.id]||[]).reduce((sum,t)=>sum+(t.type==="charge"?Number(t.amount||0):["payment","credit"].includes(t.type)?-Number(t.amount||0):t.type==="refund"?Number(t.amount||0):0),0);
  }
  function invoiceBalance(policy){
    return (invoiceByPolicy[policy.id]||[]).filter(i=>!["paid","void"].includes(i.status)).reduce((s,i)=>s+Number(i.balanceDue??i.amount??0),0);
  }
  function overdue(policy){return (invoiceByPolicy[policy.id]||[]).filter(i=>!["paid","void"].includes(i.status)&&i.dueDate<today())}
  async function logEvent(policy,type,summary,details={}){
    await addDoc(collection(db,"billingEvents"),{policyId:policy.id,policyNumber:policy.policyNumber,customerId:policy.customerId,type,summary,details,actorUid:staff.id,actorName:staff.displayName,createdAt:serverTimestamp()});
  }

  async function allocateSpecificInvoice(policy,value,invoiceId){
    const inv=(invoiceByPolicy[policy.id]||[]).find(i=>i.id===invoiceId&& !["paid","void"].includes(i.status));
    if(!inv)return {remaining:value,allocated:0,invoice:null};
    const current=Number(inv.balanceDue??inv.amount??0);
    const applied=Math.min(current,value);
    const remaining=Math.max(0,value-applied);
    await updateDoc(doc(db,"billingInvoices",inv.id),{
      balanceDue:Math.max(0,current-applied),
      status:current-applied<=0?"paid":"partial",
      lastPaymentAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    return {remaining,allocated:applied,invoice:inv};
  }

  async function recordAllocation(policy,transactionId,invoice,amount,mode){
    if(!invoice||!amount)return;
    await addDoc(collection(db,"billingPaymentAllocations"),{
      policyId:policy.id,
      policyNumber:policy.policyNumber,
      customerId:policy.customerId,
      transactionId,
      invoiceId:invoice.id,
      invoiceNumber:invoice.invoiceNumber||"",
      amount:Number(amount),
      mode,
      createdBy:staff.id,
      createdByName:staff.displayName,
      createdAt:serverTimestamp()
    });
  }

  async function allocatePayment(policy,value){
    let remaining=value;
    const open=(invoiceByPolicy[policy.id]||[]).filter(i=>!["paid","void"].includes(i.status)).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
    for(const inv of open){
      if(remaining<=0)break;
      const current=Number(inv.balanceDue??inv.amount??0);
      const applied=Math.min(current,remaining);
      remaining-=applied;
      await updateDoc(doc(db,"billingInvoices",inv.id),{balanceDue:Math.max(0,current-applied),status:current-applied<=0?"paid":"partial",lastPaymentAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
    return remaining;
  }

  async function postTransaction(e){
    e.preventDefault();if(!selected)return;
    const value=Number(amount||0);
    if(type==="refund"&&value>=5000&&!can(staff,PERMISSIONS.APPROVAL_MANAGE)){
      await addDoc(collection(db,"approvals"),{actionType:"large_refund",title:"Large premium refund",summary:selected.policyNumber+" • "+money(value)+" refund",recordId:selected.id,customerId:selected.customerId,requestedAmount:value,status:"pending",requestedBy:staff.id,requestedByName:staff.displayName,createdAt:serverTimestamp()});
      await logEvent(selected,"refund.approval.requested","Large refund sent for approval",{amount:value});setAmount("");setNote("");return;
    }
    const txRef=await addDoc(collection(db,"billingTransactions"),{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,type,amount:value,note,status:"posted",allocationMode:type==="payment"?allocationMode:null,allocatedInvoiceId:type==="payment"&&allocationMode==="specific"?allocationInvoiceId:null,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    if(type==="payment"){
      let unapplied=value;
      let allocationSummary="Unapplied customer credit";
      if(allocationMode==="specific"){
        const result=await allocateSpecificInvoice(selected,value,allocationInvoiceId);
        unapplied=result.remaining;
        if(result.invoice){
          await recordAllocation(selected,txRef.id,result.invoice,result.allocated,"specific");
          allocationSummary=(result.invoice.invoiceNumber||"Selected invoice")+" • "+money(result.allocated)+" applied";
        }
      }else if(allocationMode==="auto"){
        let remaining=value;
        const open=(invoiceByPolicy[selected.id]||[]).filter(i=>!["paid","void"].includes(i.status)).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
        for(const inv of open){
          if(remaining<=0)break;
          const current=Number(inv.balanceDue??inv.amount??0);
          const applied=Math.min(current,remaining);
          if(applied<=0)continue;
          remaining-=applied;
          await updateDoc(doc(db,"billingInvoices",inv.id),{balanceDue:Math.max(0,current-applied),status:current-applied<=0?"paid":"partial",lastPaymentAt:serverTimestamp(),updatedAt:serverTimestamp()});
          await recordAllocation(selected,txRef.id,inv,applied,"auto");
        }
        unapplied=remaining;
        allocationSummary="Automatically allocated to open invoices";
      }
      if(unapplied>0)await addDoc(collection(db,"billingCredits"),{customerId:selected.customerId,policyId:selected.id,policyNumber:selected.policyNumber,amount:unapplied,status:"unapplied",source:allocationMode==="unapplied"?"early_payment":"payment_overage",paymentTransactionId:txRef.id,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
      await updateDoc(doc(db,"policies",selected.id),{lastPaymentAmount:value,lastPaymentAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await logEvent(selected,"payment.posted","Payment posted",{amount:value,allocationMode,allocatedInvoiceId:allocationInvoiceId||null,unappliedAmount:unapplied,allocationSummary});
    }else await logEvent(selected,"transaction.posted",type+" posted",{amount:value,note});
    setAmount("");setNote("");setAllocationMode("auto");setAllocationInvoiceId("");await load();
  }

  async function reverseTransaction(t){
    if(!selected||t.status==="reversed")return;
    if(!window.confirm("Reverse this transaction? The original entry will remain in the ledger."))return;
    await updateDoc(doc(db,"billingTransactions",t.id),{status:"reversed",reversedAt:serverTimestamp(),reversedBy:staff.id});
    const reversalType=t.type==="payment"?"returned_payment":t.type==="charge"?"credit":"charge";
    await addDoc(collection(db,"billingTransactions"),{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,type:reversalType,amount:Number(t.amount||0),note:"Reversal of "+t.type+" "+t.id,status:"posted",reversesTransactionId:t.id,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    if(t.type==="payment"){
      await updateDoc(doc(db,"policies",selected.id),{billingStatus:"late",updatedAt:serverTimestamp(),billingUpdatedBy:staff.id});
      await logEvent(selected,"payment.returned","Payment reversed / returned",{amount:t.amount,transactionId:t.id});
    }else await logEvent(selected,"transaction.reversed","Transaction reversed",{transactionId:t.id,type:t.type});
    await load();
  }

  async function createInvoice(e){
    e.preventDefault();if(!selected)return;
    const value=Number(invoiceForm.amount||0);
    await addDoc(collection(db,"billingInvoices"),{invoiceNumber:invoiceNo(),policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,description:invoiceForm.description,amount:value,balanceDue:value,dueDate:invoiceForm.dueDate,status:"open",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await addDoc(collection(db,"billingTransactions"),{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,type:"charge",amount:value,note:invoiceForm.description,status:"posted",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await logEvent(selected,"invoice.created","Invoice created",{amount:value,dueDate:invoiceForm.dueDate});
    setInvoiceForm({amount:"",dueDate:"",description:"Monthly premium"});await load();
  }

  async function createCustomerInvoice(e){
    e.preventDefault();if(!selectedCustomer)return;
    const policy=selectedCustomer.policies.find(p=>p.id===customerInvoiceForm.policyId);
    if(!policy)return;
    const value=Number(customerInvoiceForm.amount||0);
    await addDoc(collection(db,"billingInvoices"),{
      invoiceNumber:invoiceNo(),
      policyId:policy.id,
      policyNumber:policy.policyNumber,
      customerId:selectedCustomer.customerId,
      customerName:selectedCustomer.customerName,
      description:customerInvoiceForm.description,
      amount:value,
      balanceDue:value,
      dueDate:customerInvoiceForm.dueDate,
      status:"open",
      createdBy:staff.id,
      createdByName:staff.displayName,
      createdAt:serverTimestamp()
    });
    await addDoc(collection(db,"billingTransactions"),{
      policyId:policy.id,
      policyNumber:policy.policyNumber,
      customerId:selectedCustomer.customerId,
      customerName:selectedCustomer.customerName,
      type:"charge",
      amount:value,
      note:customerInvoiceForm.description,
      status:"posted",
      createdBy:staff.id,
      createdByName:staff.displayName,
      createdAt:serverTimestamp()
    });
    await logEvent(policy,"invoice.created","Invoice created from customer billing account",{amount:value,dueDate:customerInvoiceForm.dueDate});
    setCustomerInvoiceForm({policyId:"",amount:"",dueDate:"",description:"Monthly premium"});
    await load();
  }

  async function generateStatement(){
    if(!selected)return;
    const open=(invoiceByPolicy[selected.id]||[]).filter(i=>!["paid","void"].includes(i.status));
    const amount=open.reduce((s,i)=>s+Number(i.balanceDue??i.amount??0),0);
    await addDoc(collection(db,"documents"),{customerId:selected.customerId,policyId:selected.id,policyNumber:selected.policyNumber,type:"billing_statement",title:"Billing Statement",status:"available",statementDate:today(),amountDue:amount,invoiceIds:open.map(i=>i.id),createdAt:serverTimestamp(),createdBy:staff.id});
    await logEvent(selected,"statement.generated","Billing statement generated",{amountDue:amount,invoiceCount:open.length});await load();
  }

  async function createPaymentPlan(e){
    e.preventDefault();if(!selected)return;
    const total=Number(planForm.totalAmount||0),count=Math.max(2,Number(planForm.installments||2)),per=total/count;
    const schedule=Array.from({length:count},(_,i)=>({number:i+1,amount:Number(per.toFixed(2)),dueDate:addDays(planForm.firstDueDate,i*30),status:"scheduled"}));
    await addDoc(collection(db,"paymentPlans"),{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,totalAmount:total,installmentCount:count,installmentAmount:Number(per.toFixed(2)),firstDueDate:planForm.firstDueDate,status:"active",schedule,createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"policies",selected.id),{billingStatus:"payment_plan",updatedAt:serverTimestamp(),billingUpdatedBy:staff.id});
    await logEvent(selected,"payment_plan.created","Payment plan created",{total,installments:count});
    setPlanForm({totalAmount:"",installments:"3",firstDueDate:""});await load();
  }

  function beginEditPlan(plan){
    setEditingPlan(plan);
    setPlanForm({
      totalAmount:String(plan.totalAmount||""),
      installments:String(plan.installmentCount||3),
      firstDueDate:plan.firstDueDate||""
    });
  }

  async function savePlanChanges(e){
    e.preventDefault();if(!editingPlan||!selected)return;
    const total=Number(planForm.totalAmount||0);
    const count=Math.max(2,Number(planForm.installments||2));
    const per=total/count;
    const schedule=Array.from({length:count},(_,i)=>({
      number:i+1,
      amount:Number(per.toFixed(2)),
      dueDate:addDays(planForm.firstDueDate,i*30),
      status:"scheduled"
    }));
    await updateDoc(doc(db,"paymentPlans",editingPlan.id),{
      totalAmount:total,
      installmentCount:count,
      installmentAmount:Number(per.toFixed(2)),
      firstDueDate:planForm.firstDueDate,
      schedule,
      modifiedAt:serverTimestamp(),
      modifiedBy:staff.id,
      modifiedByName:staff.displayName
    });
    await logEvent(selected,"payment_plan.modified","Payment plan modified",{planId:editingPlan.id,total,installments:count,firstDueDate:planForm.firstDueDate});
    setEditingPlan(null);
    setPlanForm({totalAmount:"",installments:"3",firstDueDate:""});
    await load();
  }

  async function setPlanStatus(plan,status){
    if(!selected)return;
    await updateDoc(doc(db,"paymentPlans",plan.id),{
      status,
      statusChangedAt:serverTimestamp(),
      statusChangedBy:staff.id,
      statusChangedByName:staff.displayName
    });
    await updateDoc(doc(db,"policies",selected.id),{
      billingStatus:status==="active"?"payment_plan":status==="paused"?"payment_plan_paused":"current",
      updatedAt:serverTimestamp(),
      billingUpdatedBy:staff.id
    });
    await logEvent(selected,"payment_plan."+status,"Payment plan "+status,{planId:plan.id});
    await load();
  }

  async function advanceDelinquency(){
    if(!selected)return;
    const stage=delinq.stage;
    const patch={billingStatus:stage,billingUpdatedBy:staff.id,updatedAt:serverTimestamp()};
    if(stage==="late")Object.assign(patch,{delinquentSince:today()});
    if(stage==="grace_period")Object.assign(patch,{gracePeriodEnds:delinq.graceEnds||addDays(today(),10)});
    if(stage==="cancellation_pending"){
      const effective=delinq.graceEnds||addDays(today(),10);
      Object.assign(patch,{gracePeriodEnds:effective});
      const cancellationRef=await addDoc(collection(db,"policyCancellations"),{policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,source:"billing",initiatedByType:"billing",reasonCategory:"nonpayment",reason:delinq.reason,stage:"notice_pending",noticeDate:today(),effectiveDate:effective,balanceSnapshot:invoiceBalance(selected),status:"open",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()});
      Object.assign(patch,{status:"cancellation_pending",cancellationCaseId:cancellationRef.id,cancellationStage:"notice_pending",cancellationEffectiveDate:effective,cancellationReason:delinq.reason,cancellationReasonCategory:"nonpayment"});
      await addDoc(collection(db,"documents"),{customerId:selected.customerId,policyId:selected.id,policyNumber:selected.policyNumber,type:"cancellation_notice",title:"Notice of Pending Cancellation",status:"available",effectiveDate:effective,createdAt:serverTimestamp(),createdBy:staff.id});
    }
    await updateDoc(doc(db,"policies",selected.id),patch);
    await logEvent(selected,"delinquency."+stage,"Billing status changed to "+stage.replaceAll("_"," "),{graceEnds:patch.gracePeriodEnds||null});
    setSelected({...selected,...patch});await load();
  }

  async function cureAccount(){
    if(!selected)return;
    await updateDoc(doc(db,"policies",selected.id),{billingStatus:"current",status:selected.status==="cancellation_pending"?"active":selected.status,delinquentSince:null,gracePeriodEnds:null,cancellationCaseId:null,cancellationStage:null,cancellationEffectiveDate:null,cancellationReason:null,updatedAt:serverTimestamp(),billingUpdatedBy:staff.id});
    const cases=(await safe("policyCancellations")).filter(c=>c.policyId===selected.id&&c.status==="open"&&c.source==="billing");
    for(const c of cases)await updateDoc(doc(db,"policyCancellations",c.id),{status:"rescinded",stage:"rescinded",rescindedAt:serverTimestamp(),rescindedBy:staff.id,rescindReason:"Billing account cured"});
    await logEvent(selected,"delinquency.cured","Billing account returned to current");
    setSelected({...selected,billingStatus:"current"});await load();
  }

  const collected=tx.filter(t=>t.type==="payment").reduce((s,t)=>s+Number(t.amount||0),0);
  const refunds=tx.filter(t=>t.type==="refund").reduce((s,t)=>s+Number(t.amount||0),0);
  const delinquent=policies.filter(p=>["late","grace_period","cancellation_pending"].includes(p.billingStatus)).length;
  const pastDueTotal=policies.reduce((s,p)=>s+overdue(p).reduce((x,i)=>x+Number(i.balanceDue??i.amount??0),0),0);

  return <section className="content">
    <div className="workflow-ribbon service-ribbon"><span>Policy</span><strong>Billing</strong><span>Invoice</span><span>Past Due</span><span>Grace</span><span>Cancellation</span><span>Recovery</span></div>
    <div className="page-heading"><div><div className="eyebrow">PREMIUM OPERATIONS</div><h1>Billing</h1><p>Invoices, payments, balances, payment plans, delinquency, and cancellation prevention in one account view.</p></div></div>

    <div className="metric-grid"><article className="metric-card"><div className="metric-icon"><BadgeDollarSign size={19}/></div><div className="metric-value">{money(collected)}</div><div className="metric-label">Premium collected</div></article><article className="metric-card"><div className="metric-icon"><TriangleAlert size={19}/></div><div className="metric-value">{money(pastDueTotal)}</div><div className="metric-label">Past due balance</div></article><article className="metric-card"><div className="metric-icon"><CalendarClock size={19}/></div><div className="metric-value">{delinquent}</div><div className="metric-label">Delinquent accounts</div></article><article className="metric-card"><div className="metric-icon"><ReceiptText size={19}/></div><div className="metric-value">{money(refunds)}</div><div className="metric-label">Refunds</div></article></div>

    <div className="table-card workflow-table"><div className="table-toolbar"><strong>Customer billing accounts</strong><span>{customerAccounts.length} customers • {policies.length} policies</span></div><div className="billing-customer-list">{customerAccounts.map(a=><button className={"billing-customer-row "+(a.pastDue>0?"billing-past-due":"")} key={a.customerId} onClick={()=>{setSelectedCustomer(a);setCustomerTab("overview")}}><div className="product-icon"><CreditCard size={18}/></div><div><strong>{a.customerName}</strong><span>{a.policies.length} policy account{a.policies.length===1?"":"s"} • {a.pastDue>0?money(a.pastDue)+" past due":"No past-due invoices"}</span></div><div><strong>{money(a.openBalance)}</strong><span>Total open balance</span></div><div className="billing-status-stack">{[...a.statuses].map(s=><span className={"status-pill "+s} key={s}>{s.replaceAll("_"," ")}</span>)}</div></button>)}</div></div>

    {selectedCustomer&&!selected&&<div className="modal-backdrop"><div className="modal claim-detail customer-billing-detail"><div className="billing-control-deck"><div className="modal-head"><div><div className="eyebrow">CUSTOMER BILLING ACCOUNT</div><h2>{selectedCustomer.customerName}</h2><p>One financial relationship across all Sterling Mutual policies.</p></div><button onClick={()=>setSelectedCustomer(null)}><X/></button></div><div className="billing-account-hero"><div><span>Total open</span><strong>{money(selectedCustomer.openBalance)}</strong></div><div><span>Past due</span><strong>{money(selectedCustomer.pastDue)}</strong></div><div><span>Policies</span><strong>{selectedCustomer.policies.length}</strong></div><div><span>Account health</span><strong>{selectedCustomer.pastDue>0?"Needs attention":"Current"}</strong></div></div>
      <div className="record-tabs billing-sticky-tabs">{[["overview","Overview"],["invoices","Invoices"],["payments","Payment history"],["policies","Policies"]].map(([k,l])=><button key={k} className={customerTab===k?"active":""} onClick={()=>setCustomerTab(k)}>{l}</button>)}</div></div>

      {customerTab==="overview"&&<div className="billing-overview-grid"><article className="panel"><div className="eyebrow">ACCOUNT SUMMARY</div><h3>{selectedCustomer.pastDue>0?"Past-due balance requires attention":"Account current"}</h3><p>{selectedCustomer.policies.length} policy account{selectedCustomer.policies.length===1?"":"s"} • {money(selectedCustomer.openBalance)} total open balance.</p></article><article className="panel"><div className="eyebrow">RECENT PAYMENT</div>{tx.filter(t=>t.customerId===selectedCustomer.customerId&&t.type==="payment").length?<><h3>{money(tx.filter(t=>t.customerId===selectedCustomer.customerId&&t.type==="payment")[0]?.amount)}</h3><p>{tx.filter(t=>t.customerId===selectedCustomer.customerId&&t.type==="payment")[0]?.policyNumber} • {tx.filter(t=>t.customerId===selectedCustomer.customerId&&t.type==="payment")[0]?.note||"Payment posted"}</p></>:<div className="queue-empty"><ReceiptText size={26}/><h3>No payments posted.</h3></div>}</article></div>}

      {customerTab==="invoices"&&<div className="customer-invoice-layout">{can(staff,PERMISSIONS.BILLING_MANAGE)&&<form className="panel customer-invoice-form" onSubmit={createCustomerInvoice}><div className="eyebrow">NEW INVOICE</div><h3>Create invoice</h3><label>Policy<select value={customerInvoiceForm.policyId} onChange={e=>setCustomerInvoiceForm({...customerInvoiceForm,policyId:e.target.value})} required><option value="">Select policy…</option>{selectedCustomer.policies.map(p=><option key={p.id} value={p.id}>{p.policyNumber} — {p.product?.toUpperCase()}</option>)}</select></label><label>Description<input value={customerInvoiceForm.description} onChange={e=>setCustomerInvoiceForm({...customerInvoiceForm,description:e.target.value})}/></label><div className="two-col"><label>Amount<input type="number" min="0.01" step="0.01" value={customerInvoiceForm.amount} onChange={e=>setCustomerInvoiceForm({...customerInvoiceForm,amount:e.target.value})} required/></label><label>Due date<input type="date" value={customerInvoiceForm.dueDate} onChange={e=>setCustomerInvoiceForm({...customerInvoiceForm,dueDate:e.target.value})} required/></label></div><button className="primary">Create invoice</button></form>}<div className="table-card customer-invoice-list"><div className="table-toolbar"><strong>All invoices</strong><span>{invoices.filter(i=>i.customerId===selectedCustomer.customerId).length}</span></div>{invoices.filter(i=>i.customerId===selectedCustomer.customerId).length===0?<div className="empty-state compact-empty">No invoices have been created for this customer.</div>:<div className="invoice-list">{invoices.filter(i=>i.customerId===selectedCustomer.customerId).sort((a,b)=>String(b.dueDate).localeCompare(String(a.dueDate))).map(i=><div key={i.id} className={i.dueDate<today()&&!["paid","void"].includes(i.status)?"overdue":""}><FileText size={17}/><div><strong>{i.invoiceNumber||"Invoice"} • {i.description||"Premium invoice"}</strong><span>{i.policyNumber} • Due {i.dueDate}</span></div><div><strong>{money(i.balanceDue??i.amount)}</strong><span className={"status-pill "+i.status}>{i.status}</span></div></div>)}</div>}</div></div>}

      {customerTab==="payments"&&<div className="table-card billing-history-panel"><div className="table-toolbar"><strong>Payment & transaction history</strong><span>{tx.filter(t=>t.customerId===selectedCustomer.customerId).length}</span></div>{tx.filter(t=>t.customerId===selectedCustomer.customerId).length===0?<div className="empty-state compact-empty">No billing transactions have been posted for this customer.</div>:<div className="customer-payment-history">{tx.filter(t=>t.customerId===selectedCustomer.customerId).map(t=><div key={t.id}><div className="product-icon"><CreditCard size={15}/></div><div><strong>{t.type.replaceAll("_"," ")}</strong><span>{t.policyNumber} • {t.note||"No note"} • {t.createdByName||"Staff"}</span></div><div><strong>{["payment","credit","write_off"].includes(t.type)?"−":"+"}{money(t.amount)}</strong><span className={"status-pill "+(t.status||"posted")}>{t.status||"posted"}</span></div></div>)}</div>}</div>}

      {customerTab==="policies"&&<div className="table-card account-policy-list"><div className="table-toolbar"><strong>Policies on this account</strong><span>{selectedCustomer.policies.length}</span></div>{selectedCustomer.policies.map(p=><button key={p.id} onClick={()=>{setSelected(p);setTab("overview");setDelinq({stage:p.billingStatus||"current",graceEnds:p.gracePeriodEnds||"",reason:"Nonpayment of premium"})}}><div><strong>{p.policyNumber}</strong><span>{p.product?.toUpperCase()} • {p.status}</span></div><div><strong>{money(invoiceBalance(p))}</strong><span>{(p.billingStatus||"current").replaceAll("_"," ")}</span></div></button>)}</div>}
    </div></div>}

    {selected&&<div className="modal-backdrop"><div className="modal claim-detail billing-policy-detail"><div className="billing-control-deck"><div className="modal-head"><div><div className="eyebrow">BILLING ACCOUNT</div><h2>{selected.policyNumber}</h2><p>{selected.customerName}</p></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="billing-account-hero"><div><span>Open balance</span><strong>{money(invoiceBalance(selected))}</strong></div><div><span>Ledger balance</span><strong>{money(ledgerBalance(selected))}</strong></div><div><span>Monthly premium</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Status</span><strong>{(selected.billingStatus||"current").replaceAll("_"," ")}</strong></div></div>
      <div className="record-tabs billing-sticky-tabs">{[["overview","Overview"],["invoices","Invoices"],["ledger","Ledger"],["plan","Payment plan"],["delinquency","Delinquency"],["history","History"]].map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div></div>

      {tab==="overview"&&<div className="billing-overview-grid"><article className="panel"><div className="eyebrow">ACCOUNT HEALTH</div><h3>{overdue(selected).length?"Past due":"Account current"}</h3><p>{overdue(selected).length?overdue(selected).length+" invoice(s) are beyond their due date.":"No overdue invoices detected."}</p>{can(staff,PERMISSIONS.BILLING_MANAGE)&&<form className="billing-form" onSubmit={postTransaction}><div className="three-col"><label>Transaction<select value={type} onChange={e=>{setType(e.target.value);if(e.target.value!=="payment"){setAllocationMode("auto");setAllocationInvoiceId("")}}}><option value="payment">Payment</option><option value="charge">Charge</option><option value="credit">Credit</option><option value="refund">Refund</option><option value="returned_payment">Returned payment / NSF</option><option value="write_off">Write-off</option><option value="adjustment">Manual adjustment</option></select></label><label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Note<input value={note} onChange={e=>setNote(e.target.value)}/></label></div>{type==="payment"&&<div className="payment-allocation-box"><div className="eyebrow">PAYMENT ALLOCATION</div><h4>Where should this payment go?</h4><div className="allocation-options"><label className={allocationMode==="auto"?"active":""}><input type="radio" name="allocation" checked={allocationMode==="auto"} onChange={()=>{setAllocationMode("auto");setAllocationInvoiceId("")}}/><span><strong>Auto-allocate</strong><small>Oldest open invoices first</small></span></label><label className={allocationMode==="specific"?"active":""}><input type="radio" name="allocation" checked={allocationMode==="specific"} onChange={()=>setAllocationMode("specific")}/><span><strong>Specific invoice</strong><small>Apply early or direct payment to one invoice</small></span></label><label className={allocationMode==="unapplied"?"active":""}><input type="radio" name="allocation" checked={allocationMode==="unapplied"} onChange={()=>{setAllocationMode("unapplied");setAllocationInvoiceId("")}}/><span><strong>Unapplied credit</strong><small>Hold for a future invoice</small></span></label></div>{allocationMode==="specific"&&<label>Invoice<select value={allocationInvoiceId} onChange={e=>setAllocationInvoiceId(e.target.value)} required><option value="">Choose an open invoice…</option>{(invoiceByPolicy[selected.id]||[]).filter(i=>!["paid","void"].includes(i.status)).map(i=><option key={i.id} value={i.id}>{i.invoiceNumber||"Invoice"} — {i.description} — {money(i.balanceDue??i.amount)} due {i.dueDate}</option>)}</select></label>}{allocationMode==="specific"&&allocationInvoiceId&&(()=>{const inv=(invoiceByPolicy[selected.id]||[]).find(i=>i.id===allocationInvoiceId);const pay=Number(amount||0),due=Number(inv?.balanceDue??inv?.amount??0),applied=Math.min(pay,due),left=Math.max(0,pay-due);return <div className="allocation-preview"><div><span>Applied to invoice</span><strong>{money(applied)}</strong></div><div><span>Remaining invoice balance</span><strong>{money(Math.max(0,due-pay))}</strong></div><div><span>Unapplied remainder</span><strong>{money(left)}</strong></div></div>})()}</div>}<button className="primary compact">Post transaction</button></form>}</article><article className="panel"><div className="eyebrow">ACTIVE PLAN</div>{(planByPolicy[selected.id]||[]).filter(p=>p.status==="active").length?<div className="payment-plan-preview">{(planByPolicy[selected.id]||[]).filter(p=>p.status==="active").map(p=><div key={p.id}><strong>{money(p.totalAmount)}</strong><span>{p.installmentCount} installments • {money(p.installmentAmount)} each</span></div>)}</div>:<div className="queue-empty"><RefreshCw size={26}/><h3>No payment plan.</h3></div>}</article></div>}

      {tab==="invoices"&&<div className="billing-tab-grid"><form className="panel invoice-form" onSubmit={createInvoice}><div className="eyebrow">NEW INVOICE</div><h3>Create premium invoice</h3><label>Description<input value={invoiceForm.description} onChange={e=>setInvoiceForm({...invoiceForm,description:e.target.value})}/></label><div className="two-col"><label>Amount<input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={e=>setInvoiceForm({...invoiceForm,amount:e.target.value})} required/></label><label>Due date<input type="date" value={invoiceForm.dueDate} onChange={e=>setInvoiceForm({...invoiceForm,dueDate:e.target.value})} required/></label></div><button className="primary">Create invoice</button></form><div className="table-card"><div className="table-toolbar"><strong>Invoices</strong><button className="secondary compact" type="button" onClick={generateStatement}>Generate statement</button><span>{(invoiceByPolicy[selected.id]||[]).length}</span></div><div className="invoice-list">{(invoiceByPolicy[selected.id]||[]).map(i=><div key={i.id} className={i.dueDate<today()&&!["paid","void"].includes(i.status)?"overdue":""}><FileText size={17}/><div><strong>{i.invoiceNumber||"Invoice"} • {i.description}</strong><span>Due {i.dueDate}</span></div><div><strong>{money(i.balanceDue??i.amount)}</strong><span className={"status-pill "+i.status}>{i.status}</span></div></div>)}</div></div></div>}

      {tab==="ledger"&&<div className="ledger"><div className="table-toolbar"><strong>Account ledger</strong><span>{(byPolicy[selected.id]||[]).length} entries</span></div>{(byPolicy[selected.id]||[]).length===0?<div className="empty-state compact-empty">No transactions yet.</div>:(byPolicy[selected.id]||[]).map(t=><div className="ledger-row" key={t.id}><div><strong>{t.type.replaceAll("_"," ")}</strong><span>{t.note||"No note"} • {t.createdByName||"Staff"}</span></div><strong className={["payment","credit"].includes(t.type)?"credit-amount":""}>{["payment","credit","write_off"].includes(t.type)?"−":"+"}{money(t.amount)}</strong>{can(staff,PERMISSIONS.BILLING_MANAGE)&&t.status!=="reversed"&&<button className="link-button ledger-reverse" onClick={()=>reverseTransaction(t)}>Reverse</button>}{t.status==="reversed"&&<span className="status-pill">reversed</span>}</div>)}</div>}

      {tab==="plan"&&<div className="billing-tab-grid"><form className="panel" onSubmit={editingPlan?savePlanChanges:createPaymentPlan}><div className="eyebrow">PAYMENT ARRANGEMENT</div><h3>{editingPlan?"Modify payment plan":"Create payment plan"}</h3>{editingPlan&&<div className="notice-box">You are editing an existing plan. The updated schedule will replace the remaining planned schedule while the billing history remains preserved.</div>}<label>Total amount<input type="number" min="0" value={planForm.totalAmount} onChange={e=>setPlanForm({...planForm,totalAmount:e.target.value})} required/></label><div className="two-col"><label>Installments<select value={planForm.installments} onChange={e=>setPlanForm({...planForm,installments:e.target.value})}><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option><option value="12">12</option></select></label><label>First due date<input type="date" value={planForm.firstDueDate} onChange={e=>setPlanForm({...planForm,firstDueDate:e.target.value})} required/></label></div><div className="action-stack">{editingPlan&&<button type="button" className="secondary" onClick={()=>{setEditingPlan(null);setPlanForm({totalAmount:"",installments:"3",firstDueDate:""})}}>Cancel edit</button>}<button className="primary">{editingPlan?"Save plan changes":"Create plan"}</button></div></form><div className="table-card"><div className="table-toolbar"><strong>Payment plans</strong><span>{(planByPolicy[selected.id]||[]).length}</span></div><div className="plan-list editable-plan-list">{(planByPolicy[selected.id]||[]).map(p=><div key={p.id}><CheckCircle2 size={17}/><div><strong>{money(p.totalAmount)} • {p.installmentCount} installments</strong><span>{p.status} • {money(p.installmentAmount)} each • first due {p.firstDueDate}</span></div>{can(staff,PERMISSIONS.BILLING_MANAGE)&&<div className="plan-actions"><button className="secondary compact" onClick={()=>beginEditPlan(p)}>Modify</button>{p.status==="active"&&<button className="secondary compact" onClick={()=>setPlanStatus(p,"paused")}>Pause</button>}{p.status==="paused"&&<button className="secondary compact" onClick={()=>setPlanStatus(p,"active")}>Resume</button>}{!["ended","cancelled"].includes(p.status)&&<button className="secondary compact danger-soft" onClick={()=>setPlanStatus(p,"ended")}>End plan</button>}</div>}</div>)}</div></div></div>}

      {tab==="delinquency"&&<div className="delinquency-workflow"><div className="delinquency-steps">{["current","late","grace_period","cancellation_pending"].map((s,i)=><div className={(selected.billingStatus||"current")===s?"active":""} key={s}><span>{i+1}</span><strong>{s.replaceAll("_"," ")}</strong></div>)}</div>{can(staff,PERMISSIONS.BILLING_MANAGE)&&<div className="panel"><div className="eyebrow">DELINQUENCY ACTION</div><h3>Advance or cure account</h3><label>Stage<select value={delinq.stage} onChange={e=>setDelinq({...delinq,stage:e.target.value})}><option value="current">Current</option><option value="late">Late</option><option value="grace_period">Grace period</option><option value="cancellation_pending">Cancellation pending</option></select></label>{["grace_period","cancellation_pending"].includes(delinq.stage)&&<label>Grace / cancellation effective date<input type="date" value={delinq.graceEnds} onChange={e=>setDelinq({...delinq,graceEnds:e.target.value})}/></label>}{delinq.stage==="cancellation_pending"&&<label>Reason<textarea rows="3" value={delinq.reason} onChange={e=>setDelinq({...delinq,reason:e.target.value})}/></label>}<div className="action-stack"><button className="primary" onClick={advanceDelinquency}>Apply stage</button><button className="secondary" onClick={cureAccount}>Cure account / rescind billing cancellation</button></div></div>}</div>}

      {tab==="history"&&<div className="timeline">{events.filter(e=>e.policyId===selected.id).map(e=><div key={e.id}><span className="timeline-dot"></span><div><strong>{e.summary}</strong><p>{e.type}</p><small>{e.actorName||"System"} • {e.createdAt?.toDate?e.createdAt.toDate().toLocaleString():"Recorded"}</small></div></div>)}</div>}
    </div></div>}
  </section>
}
