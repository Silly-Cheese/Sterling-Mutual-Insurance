import {useMemo,useState} from "react";
import {doc,collection,getDoc,serverTimestamp,writeBatch} from "firebase/firestore";
import {ArrowRight,CheckCircle2,FileCheck2,LockKeyhole,LogOut,ShieldCheck,UserRoundPlus} from "lucide-react";
import {auth,db} from "../firebase";

function defaultNames(displayName){
  const parts=String(displayName||"").trim().split(/\s+/).filter(Boolean);
  return {firstName:parts[0]||"",lastName:parts.slice(1).join(" ")||"",phone:""};
}

export default function CustomerOnboarding({user,account,onComplete,onSignOut}){
  const [form,setForm]=useState(()=>defaultNames(account?.displayName||user.displayName));
  const [acknowledged,setAcknowledged]=useState(false);
  const [existingPolicy,setExistingPolicy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const email=useMemo(()=>String(user.email||"").trim().toLowerCase(),[user.email]);

  async function submit(event){
    event.preventDefault();
    if(saving)return;
    setError("");
    const firstName=form.firstName.trim().replace(/\s+/g," ");
    const lastName=form.lastName.trim().replace(/\s+/g," ");
    const phone=form.phone.trim();
    if(firstName.length<2||lastName.length<2||firstName.length>80||lastName.length>80){
      setError("Enter your legal first and last name (2–80 characters each).");
      return;
    }
    if(phone.length>30){
      setError("Please enter a shorter phone number.");
      return;
    }
    if(!acknowledged){
      setError("Confirm that the information belongs to you before continuing.");
      return;
    }
    setSaving(true);
    try{
      if(auth.currentUser?.uid!==user.uid)throw new Error("Your sign-in session changed. Please sign in again.");
      const accountRef=doc(db,"accounts",user.uid);
      const customerAccountRef=doc(db,"customerAccounts",user.uid);
      const [current,alreadyLinked]=await Promise.all([getDoc(accountRef),getDoc(customerAccountRef)]);
      if(alreadyLinked.exists()){
        await onComplete();
        return;
      }
      if(!current.exists()||current.data().accountType!=="customer"||current.data().accessStatus!=="pending"){
        throw new Error("This account cannot register a new customer record. Please contact Sterling Mutual.");
      }

      const customerRef=doc(collection(db,"customers"));
      const now=serverTimestamp();
      const displayName=firstName+" "+lastName;
      const batch=writeBatch(db);
      batch.set(customerRef,{
        firstName,lastName,displayName,email,phone,
        authUid:user.uid,portalEmail:email,portalStatus:"active",
        status:"prospect",source:"self_service",createdBy:user.uid,
        createdAt:now,updatedAt:now
      });
      batch.set(customerAccountRef,{
        authUid:user.uid,customerId:customerRef.id,
        email,displayName,status:"active",createdBy:user.uid,createdAt:now
      });
      batch.update(accountRef,{
        accessStatus:"customer",customerId:customerRef.id,
        linkedAt:now,linkedBy:user.uid
      });
      await batch.commit();
      await onComplete();
    }catch(err){
      if(err?.code==="permission-denied"){
        setError("Your customer record could not be saved. Please confirm that Sterling Mutual's updated Firestore rules are deployed and try again.");
      }else{
        setError(err?.message||"Unable to finish setting up your customer account.");
      }
    }finally{
      setSaving(false);
    }
  }

  return <div className="customer-onboarding-shell">
    <header className="customer-onboarding-top">
      <div className="brand-lockup">
        <div className="brand-mark">SM</div>
        <div><strong>Sterling Mutual</strong><span>Insurance Group</span></div>
      </div>
      <button type="button" className="customer-onboarding-signout" onClick={onSignOut}><LogOut size={16}/> Sign out</button>
    </header>
    <main className="customer-onboarding-main">
      <section className="customer-onboarding-hero">
        <div className="customer-onboarding-icon"><UserRoundPlus size={25}/></div>
        <div className="eyebrow">ONE LAST STEP • CUSTOMER PORTAL</div>
        <h1>Make yourself at home.</h1>
        <p>Your Sterling account is created. Complete your customer profile and your portal will open immediately—no email verification or staff approval required to create a new customer record.</p>
        <div className="customer-onboarding-steps" aria-label="Account setup progress">
          <span className="complete"><CheckCircle2 size={16}/> Login created</span>
          <span className="current"><span className="customer-step-number">2</span> Your profile</span>
          <span><FileCheck2 size={16}/> Customer portal</span>
        </div>
        <div className="customer-onboarding-benefits">
          <div><ShieldCheck size={19}/><span><strong>Your information stays yours.</strong> This record is securely linked to your signed-in account.</span></div>
          <div><LockKeyhole size={19}/><span><strong>Your policy stays protected.</strong> Creating a profile does not give access to another person's coverage or claims.</span></div>
        </div>
      </section>
      <form onSubmit={submit} className="customer-onboarding-card">
        <div className="eyebrow">CUSTOMER REGISTRATION</div>
        <h2>Tell us a little about yourself.</h2>
        <p>These details create your customer record. You can request coverage and submit medical payout requests from your portal.</p>
        <div className="customer-onboarding-fields">
          <label>Legal first name<input autoComplete="given-name" maxLength={80} value={form.firstName} onChange={e=>setForm(v=>({...v,firstName:e.target.value}))} placeholder="First name" required/></label>
          <label>Legal last name<input autoComplete="family-name" maxLength={80} value={form.lastName} onChange={e=>setForm(v=>({...v,lastName:e.target.value}))} placeholder="Last name" required/></label>
          <label className="customer-onboarding-full">Account email<input type="email" value={email} readOnly/><small>Your sign-in email. No email verification link is required.</small></label>
          <label className="customer-onboarding-full">Phone number <span className="customer-optional">Optional</span><input autoComplete="tel" type="tel" maxLength={30} value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} placeholder="(555) 123-4567"/></label>
        </div>
        <div className="customer-onboarding-existing">
          <label className="customer-onboarding-check"><input type="checkbox" checked={existingPolicy} onChange={e=>setExistingPolicy(e.target.checked)}/><span>I may already have a Sterling Mutual policy or customer record.</span></label>
          {existingPolicy&&<p><strong>Already insured?</strong> Your new login will not automatically take ownership of existing policies. To access an existing policy, have Sterling staff verify and link it securely. You may still create your own new profile.</p>}
        </div>
        <label className="customer-onboarding-check customer-confirm"><input type="checkbox" required checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I confirm these are my own details and that I am creating my own customer profile.</span></label>
        {error&&<div className="customer-onboarding-error" role="alert">{error}</div>}
        <button type="submit" className="primary customer-onboarding-submit" disabled={saving}>{saving?"Creating your profile…":<>Create my customer profile <ArrowRight size={17}/></>}</button>
        <small className="customer-onboarding-disclaimer">This creates a customer record, not an insurance policy. Coverage, policy matching, and payouts remain subject to Sterling Mutual's separate processes.</small>
      </form>
    </main>
  </div>;
}
