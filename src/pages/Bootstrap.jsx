import {useState} from "react";
import {Building2,CheckCircle2,KeyRound,ShieldCheck} from "lucide-react";
import {signInWithEmailAndPassword} from "firebase/auth";
import {auth} from "../firebase";

export default function Bootstrap({onBack}){
  const [form,setForm]=useState({code:"",displayName:"",email:"",password:""});
  const [status,setStatus]=useState("idle"),[message,setMessage]=useState("");
  const update=k=>e=>setForm(v=>({...v,[k]:e.target.value}));
  async function submit(e){
    e.preventDefault(); setStatus("loading"); setMessage("");
    try{
      const endpoint=import.meta.env.VITE_BOOTSTRAP_ENDPOINT;
      if(!endpoint)throw new Error("Bootstrap endpoint is not configured.");
      const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Bootstrap failed.");
      setStatus("success"); setMessage("Sterling Mutual has been initialized. Signing you in…");
      await signInWithEmailAndPassword(auth,form.email,form.password);
      history.replaceState(null,"","/");
    }catch(err){setStatus("error");setMessage(err.message)}
  }
  if(status==="success")return <div className="auth-shell"><div className="auth-card centered"><CheckCircle2 size={44}/><div className="eyebrow">INITIALIZATION COMPLETE</div><h1>Sterling Mutual is live.</h1><p>{message}</p></div></div>;
  return <div className="bootstrap-layout">
    <section className="bootstrap-hero"><div className="brand-lockup"><div className="brand-mark">SM</div><div><strong>Sterling Mutual</strong><span>Insurance Group</span></div></div><div className="bootstrap-copy"><div className="eyebrow">INITIAL ORGANIZATION BOOTSTRAP</div><h1>Establish the company’s first system owner.</h1><p>This process can be completed once. The first account receives Founder / Chief Executive Officer authority and the system records the company’s first audit event.</p><div className="security-list"><div><ShieldCheck/><span><strong>One-time initialization</strong><small>Bootstrap closes after successful setup.</small></span></div><div><KeyRound/><span><strong>Server-side secret verification</strong><small>The bootstrap code is never stored in the website source.</small></span></div><div><Building2/><span><strong>Founder authority</strong><small>The initial account receives system-owner access.</small></span></div></div></div></section>
    <section className="bootstrap-panel"><button className="back-link" onClick={onBack}>← Back to sign in</button><form className="bootstrap-form" onSubmit={submit}><div><div className="eyebrow">STERLING MUTUAL</div><h2>Initial system setup</h2><p>Enter the private bootstrap credential and create the founder account.</p></div><label>Bootstrap code<input type="password" autoComplete="off" value={form.code} onChange={update("code")} required/></label><label>Founder name<input placeholder="Full display name" value={form.displayName} onChange={update("displayName")} required/></label><label>Email address<input type="email" value={form.email} onChange={update("email")} required/></label><label>Password<input type="password" minLength="10" value={form.password} onChange={update("password")} required/><small>Use at least 10 characters.</small></label>{message&&<div className={status==="error"?"error-box":"notice-box"}>{message}</div>}<button className="primary" disabled={status==="loading"}>{status==="loading"?"Initializing…":"Initialize Sterling Mutual"}</button><small className="legal-note">This creates the first privileged staff account and cannot be repeated after initialization.</small></form></section>
  </div>
}
