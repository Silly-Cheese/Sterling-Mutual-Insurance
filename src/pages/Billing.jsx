import {useEffect,useMemo,useState} from "react";
import {addDoc,collection,doc,getDocs,serverTimestamp,updateDoc} from "firebase/firestore";
import {BadgeDollarSign,CreditCard,ReceiptText,TriangleAlert,X} from "lucide-react";
import {db} from "../firebase";
import {can,PERMISSIONS} from "../permissions";

const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));

export default function Billing({staff,initialPolicyId}){
  const [policies,setPolicies]=useState([]),[tx,setTx]=useState([]),[selected,setSelected]=useState(null),[amount,setAmount]=useState(""),[type,setType]=useState("payment"),[note,setNote]=useState("");

  async function load(){
    const [p,t]=await Promise.all([getDocs(collection(db,"policies")),getDocs(collection(db,"billingTransactions"))]);
    setPolicies(p.docs.map(d=>({id:d.id,...d.data()})));
    setTx(t.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{if(initialPolicyId&&policies.length){const p=policies.find(x=>x.id===initialPolicyId);if(p)setSelected(p)}},[initialPolicyId,policies]);

  const byPolicy=useMemo(()=>{
    const out={};
    tx.forEach(t=>{(out[t.policyId]||(out[t.policyId]=[])).push(t)});
    return out;
  },[tx]);

  function balance(policy){
    const list=byPolicy[policy.id]||[];
    return list.reduce((sum,t)=>sum+(t.type==="charge"?Number(t.amount||0):t.type==="payment"||t.type==="credit"||t.type==="refund"?-Number(t.amount||0):0),0);
  }

  async function postTransaction(e){
    e.preventDefault();
    const value=Number(amount||0);
    if(type==="refund"&&value>=5000&&!can(staff,PERMISSIONS.APPROVAL_MANAGE)){
      await addDoc(collection(db,"approvals"),{
        actionType:"large_refund",
        title:"Large premium refund",
        summary:selected.policyNumber+" • "+money(value)+" refund",
        recordId:selected.id,
        customerId:selected.customerId,
        requestedAmount:value,
        status:"pending",
        requestedBy:staff.id,
        requestedByName:staff.displayName,
        createdAt:serverTimestamp()
      });
      setAmount("");setNote("");
      return;
    }
    await addDoc(collection(db,"billingTransactions"),{
      policyId:selected.id,policyNumber:selected.policyNumber,customerId:selected.customerId,customerName:selected.customerName,
      type,amount:value,note,status:"posted",createdBy:staff.id,createdByName:staff.displayName,createdAt:serverTimestamp()
    });
    if(type==="payment"){
      await updateDoc(doc(db,"policies",selected.id),{billingStatus:"current",lastPaymentAmount:value,lastPaymentAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
    setAmount("");setNote("");await load();
  }

  async function setBillingStatus(status){
    await updateDoc(doc(db,"policies",selected.id),{billingStatus:status,updatedAt:serverTimestamp(),billingUpdatedBy:staff.id});
    setSelected({...selected,billingStatus:status});await load();
  }

  const collected=tx.filter(t=>t.type==="payment").reduce((s,t)=>s+Number(t.amount||0),0);
  const refunds=tx.filter(t=>t.type==="refund").reduce((s,t)=>s+Number(t.amount||0),0);
  const delinquent=policies.filter(p=>["late","grace_period","cancellation_pending"].includes(p.billingStatus)).length;

  return <section className="content">
    <div className="workflow-ribbon service-ribbon"><span>Customer</span><span>Quote</span><span>Policy</span><strong>Billing</strong><span>Delinquency</span><span>Resolution</span></div>
    <div className="page-heading"><div><div className="eyebrow">PREMIUM OPERATIONS</div><h1>Billing</h1><p>Post premium activity, track account status, and manage delinquency workflows.</p></div></div>

    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon"><BadgeDollarSign size={19}/></div><div className="metric-value">{money(collected)}</div><div className="metric-label">Premium collected</div><div className="metric-sub">Posted payments</div></article>
      <article className="metric-card"><div className="metric-icon"><ReceiptText size={19}/></div><div className="metric-value">{money(refunds)}</div><div className="metric-label">Refunds</div><div className="metric-sub">Returned premium</div></article>
      <article className="metric-card"><div className="metric-icon"><TriangleAlert size={19}/></div><div className="metric-value">{delinquent}</div><div className="metric-label">Delinquent accounts</div><div className="metric-sub">Late / grace / cancellation pending</div></article>
      <article className="metric-card"><div className="metric-icon"><CreditCard size={19}/></div><div className="metric-value">{policies.length}</div><div className="metric-label">Policy accounts</div><div className="metric-sub">Billing-enabled policies</div></article>
    </div>

    <div className="table-card workflow-table">
      <div className="table-toolbar"><strong>Policy billing accounts</strong><span>{policies.length} accounts</span></div>
      <div className="quote-list">{policies.map(p=><button className="policy-row billing-row" key={p.id} onClick={()=>setSelected(p)}>
        <div className="product-icon"><CreditCard size={18}/></div>
        <div className="quote-main"><strong>{p.customerName}</strong><span>{p.policyNumber} • {p.product?.toUpperCase()}</span></div>
        <div className="quote-money"><strong>{money(balance(p))}</strong><span>Current ledger balance</span></div>
        <span className={"status-pill "+(p.billingStatus||"current")}>{(p.billingStatus||"current").replaceAll("_"," ")}</span>
      </button>)}</div>
    </div>

    {selected&&<div className="modal-backdrop"><div className="modal wide">
      <div className="modal-head"><div><div className="eyebrow">BILLING ACCOUNT</div><h2>{selected.policyNumber}</h2></div><button onClick={()=>setSelected(null)}><X/></button></div>
      <div className="policy-hero"><div><span>Customer</span><strong>{selected.customerName}</strong></div><div><span>Monthly premium</span><strong>{money(selected.monthlyPremium)}</strong></div><div><span>Billing status</span><strong>{(selected.billingStatus||"current").toUpperCase()}</strong></div></div>

      {can(staff,PERMISSIONS.BILLING_MANAGE)&&<form className="billing-form" onSubmit={postTransaction}>
        <div className="three-col"><label>Transaction type<select value={type} onChange={e=>setType(e.target.value)}><option value="payment">Payment</option><option value="charge">Charge</option><option value="credit">Credit</option><option value="refund">Refund</option></select></label><label>Amount<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Note<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional transaction note"/></label></div>
        <button className="primary compact">Post transaction</button>
      </form>}

      <div className="billing-status-actions">
        {can(staff,PERMISSIONS.BILLING_MANAGE)&&<>
          <button className="secondary compact" onClick={()=>setBillingStatus("current")}>Current</button>
          <button className="secondary compact" onClick={()=>setBillingStatus("late")}>Mark late</button>
          <button className="secondary compact" onClick={()=>setBillingStatus("grace_period")}>Grace period</button>
          <button className="secondary compact danger-soft" onClick={()=>setBillingStatus("cancellation_pending")}>Cancellation pending</button>
        </>}
      </div>

      <div className="ledger"><div className="table-toolbar"><strong>Ledger</strong><span>{(byPolicy[selected.id]||[]).length} entries</span></div>
        {(byPolicy[selected.id]||[]).length===0?<div className="empty-state compact-empty">No transactions yet.</div>:(byPolicy[selected.id]||[]).map(t=><div className="ledger-row" key={t.id}><div><strong>{t.type.replaceAll("_"," ")}</strong><span>{t.note||"No note"} • {t.createdByName||"Staff"}</span></div><strong className={t.type==="payment"||t.type==="credit"?"credit-amount":""}>{t.type==="payment"||t.type==="credit"?"−":"+"}{money(t.amount)}</strong></div>)}
      </div>
    </div></div>}
  </section>
}
