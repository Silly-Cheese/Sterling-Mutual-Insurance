const json=(body,status=200,origin="")=>new Response(JSON.stringify(body),{
  status,
  headers:{
    "Content-Type":"application/json",
    ...(origin?{"Access-Control-Allow-Origin":origin}:{})
  }
});

const allowedOrigins=new Set([
  "https://silly-cheese.github.io",
  "http://localhost:5173"
]);

function corsHeaders(origin){
  return {
    ...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Vary":"Origin"
  };
}

function b64url(bytes){
  let s="";
  for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function pemToArrayBuffer(pem){
  const clean=pem.replace(/-----BEGIN PRIVATE KEY-----/g,"").replace(/-----END PRIVATE KEY-----/g,"").replace(/\s+/g,"");
  const bin=atob(clean);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}

async function googleAccessToken(serviceAccount){
  const now=Math.floor(Date.now()/1000);
  const header=b64url(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const payload=b64url(new TextEncoder().encode(JSON.stringify({
    iss:serviceAccount.client_email,
    scope:"https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore",
    aud:"https://oauth2.googleapis.com/token",
    iat:now,
    exp:now+3600
  })));
  const input=header+"."+payload;
  const key=await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(input));
  const assertion=input+"."+b64url(new Uint8Array(sig));
  const res=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data=await res.json();
  if(!res.ok) throw new Error("Unable to obtain Google access token.");
  return data.access_token;
}

const fsValue=(v)=>{
  if(v===null)return {nullValue:null};
  if(typeof v==="string")return {stringValue:v};
  if(typeof v==="boolean")return {booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return {arrayValue:{values:v.map(fsValue)}};
  if(typeof v==="object")return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,val])=>[k,fsValue(val)]))}};
  return {stringValue:String(v)};
};

function docBody(obj){
  return {fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,fsValue(v)]))};
}

async function createDocument(project,token,collectionId,documentId,data){
  const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collectionId}?documentId=${encodeURIComponent(documentId)}`;
  return fetch(url,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(docBody(data))
  });
}

async function patchDocument(project,token,path,data){
  const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`;
  return fetch(url,{
    method:"PATCH",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(docBody(data))
  });
}

async function deleteDocument(project,token,path){
  return fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`,{
    method:"DELETE",
    headers:{Authorization:`Bearer ${token}`}
  });
}

async function createAuthUser(apiKey,email,password,displayName){
  const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password,displayName,returnSecureToken:false})
  });
  const data=await res.json();
  if(!res.ok){
    const msg=data?.error?.message||"Unable to create Firebase user.";
    throw new Error(msg);
  }
  return data.localId;
}

async function deleteAuthUser(project,token,uid){
  await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({localId:uid})
  });
}

export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin")||"";
    if(request.method==="OPTIONS"){
      return new Response("",{status:204,headers:corsHeaders(origin)});
    }
    if(request.method!=="POST"){
      return new Response("Method not allowed",{status:405,headers:corsHeaders(origin)});
    }
    if(!allowedOrigins.has(origin)){
      return json({error:"Origin not allowed."},403,origin);
    }

    let body;
    try{body=await request.json()}catch{return json({error:"Invalid request."},400,origin)}
    const {code,displayName,email,password}=body||{};

    if(code!==env.BOOTSTRAP_SECRET){
      return json({error:"Invalid bootstrap credential."},403,origin);
    }
    if(!displayName||!email||!password||String(password).length<10){
      return json({error:"Name, email and a password of at least 10 characters are required."},400,origin);
    }

    let serviceAccount;
    try{serviceAccount=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)}
    catch{return json({error:"Worker Firebase credentials are not configured."},500,origin)}

    const project=env.FIREBASE_PROJECT_ID;
    let token;
    try{token=await googleAccessToken(serviceAccount)}
    catch{return json({error:"Worker could not authenticate to Firebase."},500,origin)}

    const lock=await createDocument(project,token,"system","bootstrap",{
      state:"initializing",
      startedAt:new Date().toISOString(),
      bootstrapVersion:1
    });

    if(lock.status===409){
      return json({error:"Sterling Mutual has already been initialized. Bootstrap access is closed."},409,origin);
    }
    if(!lock.ok){
      return json({error:"Unable to acquire bootstrap lock."},500,origin);
    }

    let uid=null;
    try{
      uid=await createAuthUser(env.FIREBASE_API_KEY,String(email).trim().toLowerCase(),password,String(displayName).trim());

      const staff=await createDocument(project,token,"staff",uid,{
        employeeId:"SMI-000001",
        authUid:uid,
        displayName:String(displayName).trim(),
        email:String(email).trim().toLowerCase(),
        role:"founder",
        department:"executive",
        title:"Founder / Chief Executive Officer",
        status:"active",
        permissions:["*"],
        createdAt:new Date().toISOString(),
        createdBy:"bootstrap"
      });
      if(!staff.ok) throw new Error("Unable to create founder staff record.");

      const auditId=crypto.randomUUID();
      const audit=await createDocument(project,token,"auditLogs",auditId,{
        sequence:1,
        eventType:"system.bootstrap.completed",
        actorUid:uid,
        actorEmployeeId:"SMI-000001",
        actorDisplayName:String(displayName).trim(),
        summary:"Sterling Mutual Insurance initialized",
        details:{authorization:"Founder / System Owner",bootstrapVersion:1},
        createdAt:new Date().toISOString()
      });
      if(!audit.ok) throw new Error("Unable to create bootstrap audit event.");

      const finalize=await patchDocument(project,token,"system/bootstrap",{
        state:"initialized",
        initialized:true,
        initializedBy:uid,
        initializedAt:new Date().toISOString(),
        bootstrapVersion:1
      });
      if(!finalize.ok) throw new Error("Unable to finalize bootstrap.");

      return json({ok:true,employeeId:"SMI-000001"},201,origin);
    }catch(err){
      if(uid)try{await deleteAuthUser(project,token,uid)}catch{}
      try{await deleteDocument(project,token,"system/bootstrap")}catch{}
      return json({error:err.message||"Bootstrap failed."},500,origin);
    }
  }
};
