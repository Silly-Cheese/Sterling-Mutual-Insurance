import {useState} from "react";
import {Building2,CheckCircle2,ShieldCheck} from "lucide-react";
import {doc,writeBatch,serverTimestamp} from "firebase/firestore";
import {db} from "../firebase";

export default function Bootstrap({user,onComplete,onSignOut}){
  const [status,setStatus]=useState("idle");
  const [message,setMessage]=useState("");

  async function initialize(){
    if(!user)return;
    setStatus("loading"); setMessage("");
    try{
      const batch=writeBatch(db);
      const staffRef=doc(db,"staff",user.uid);
      const bootRef=doc(db,"system","bootstrap");
      const auditRef=doc(db,"auditLogs","bootstrap-000001");
      const name=(user.displayName||user.email?.split("@")[0]||"Founder").trim();

      batch.set(staffRef,{
        employeeId:"SMI-000001",
        authUid:user.uid,
        displayName:name,
        email:(user.email||"").toLowerCase(),
        role:"founder",
        department:"executive",
        title:"Founder / Chief Executive Officer",
        status:"active",
        permissions:["*"],
        createdAt:serverTimestamp(),
        createdBy:"bootstrap"
      });

      batch.set(bootRef,{
        state:"initialized",
        initialized:true,
        initializedBy:user.uid,
        initializedAt:serverTimestamp(),
        bootstrapVersion:1
      });

      batch.set(auditRef,{
        sequence:1,
        eventType:"system.bootstrap.completed",
        actorUid:user.uid,
        actorEmployeeId:"SMI-000001",
        actorDisplayName:name,
        summary:"Sterling Mutual Insurance initialized",
        details:{authorization:"Founder / System Owner",bootstrapVersion:1},
        createdAt:serverTimestamp()
      });

      await batch.commit();
      setStatus("success");
      setMessage("Sterling Mutual has been initialized.");
      onComplete?.();
    }catch(err){
      console.error(err);
      setStatus("error");
      setMessage(err?.code==="permission-denied"
        ?"Initialization was blocked by Firestore security rules. Make sure the updated rules have been published."
        :"Sterling Mutual could not be initialized. Please try again.");
    }
  }

  if(status==="success")return <div className="auth-shell"><div className="auth-card centered">
    <CheckCircle2 size={44}/>
    <div className="eyebrow">INITIALIZATION COMPLETE</div>
    <h1>Sterling Mutual is live.</h1>
    <p>{message}</p>
  </div></div>;

  return <div className="bootstrap-layout">
    <section className="bootstrap-hero">
      <div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div></div>
      <div className="bootstrap-copy">
        <div className="eyebrow">FIRST SIGN-IN SETUP</div>
        <h1>Initialize Sterling Mutual.</h1>
        <p>Your Firebase Authentication account is ready. Sterling Mutual can now create the company’s first Founder profile and permanently close initial setup.</p>
        <div className="security-list">
          <div><ShieldCheck/><span><strong>One-time initialization</strong><small>Only available while no company bootstrap record exists.</small></span></div>
          <div><Building2/><span><strong>Founder authority</strong><small>Your signed-in Firebase account becomes SMI-000001 with full system access.</small></span></div>
        </div>
      </div>
    </section>
    <section className="bootstrap-panel">
      <div className="bootstrap-form">
        <div><div className="eyebrow">STERLING MUTUAL</div><h2>Ready to initialize</h2><p>Signed in as <strong>{user?.email}</strong>.</p></div>
        {message&&<div className="error-box">{message}</div>}
        <button className="primary" onClick={initialize} disabled={status==="loading"}>{status==="loading"?"Initializing…":"Initialize Sterling Mutual"}</button>
        <button className="link-button" onClick={onSignOut}>Use a different account</button>
        <small className="legal-note">This is a one-time company setup. After initialization, future accounts require staff authorization.</small>
      </div>
    </section>
  </div>;
}
