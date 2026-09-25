const {onRequest}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const admin=require("firebase-admin");
const crypto=require("crypto");

admin.initializeApp();
const db=admin.firestore();
const BOOTSTRAP_SECRET=defineSecret("BOOTSTRAP_SECRET");

function sameSecret(a,b){
  const aa=Buffer.from(String(a||""));
  const bb=Buffer.from(String(b||""));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}

exports.bootstrap=onRequest(
  {region:"us-central1",secrets:[BOOTSTRAP_SECRET],cors:true},
  async(req,res)=>{
    if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
    const {code,displayName,email,password}=req.body||{};
    if(!sameSecret(code,BOOTSTRAP_SECRET.value()))return res.status(403).json({error:"Invalid bootstrap credential."});
    if(!displayName||!email||!password||password.length<10)return res.status(400).json({error:"Name, email and a password of at least 10 characters are required."});

    const bootRef=db.doc("system/bootstrap");
    let locked=false;
    let createdUid=null;

    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(bootRef);
        if(snap.exists && ["initializing","initialized"].includes(snap.data().state))throw new Error("ALREADY_INITIALIZED");
        tx.set(bootRef,{state:"initializing",startedAt:admin.firestore.FieldValue.serverTimestamp()});
      });
      locked=true;

      const user=await admin.auth().createUser({
        email:String(email).trim().toLowerCase(),
        password,
        displayName:String(displayName).trim(),
        emailVerified:false,
        disabled:false
      });
      createdUid=user.uid;

      await admin.auth().setCustomUserClaims(user.uid,{staff:true,founder:true,systemOwner:true,role:"founder"});

      const batch=db.batch();
      batch.set(db.doc(`staff/${user.uid}`),{
        employeeId:"SMI-000001",
        authUid:user.uid,
        displayName:String(displayName).trim(),
        email:String(email).trim().toLowerCase(),
        role:"founder",
        department:"executive",
        title:"Founder / Chief Executive Officer",
        status:"active",
        permissions:["*"],
        createdAt:admin.firestore.FieldValue.serverTimestamp(),
        createdBy:"bootstrap"
      });
      batch.set(bootRef,{
        state:"initialized",
        initialized:true,
        initializedBy:user.uid,
        initializedAt:admin.firestore.FieldValue.serverTimestamp(),
        bootstrapVersion:1
      });
      batch.set(db.collection("auditLogs").doc(),{
        sequence:1,
        eventType:"system.bootstrap.completed",
        actorUid:user.uid,
        actorEmployeeId:"SMI-000001",
        actorDisplayName:String(displayName).trim(),
        summary:"Sterling Mutual Insurance initialized",
        details:{authorization:"Founder / System Owner",bootstrapVersion:1},
        createdAt:admin.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();

      return res.status(201).json({ok:true,employeeId:"SMI-000001"});
    }catch(err){
      if(err.message==="ALREADY_INITIALIZED")return res.status(409).json({error:"Sterling Mutual has already been initialized. Bootstrap access is closed."});

      if(createdUid){
        try{await admin.auth().deleteUser(createdUid)}catch{}
      }
      if(locked){
        try{
          const snap=await bootRef.get();
          if(snap.exists && snap.data().state==="initializing")await bootRef.delete();
        }catch{}
      }
      console.error("bootstrap failed",err);
      return res.status(500).json({error:"The system could not be initialized. Review the server logs and try again."});
    }
  }
);
