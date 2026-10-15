import crypto from 'node:crypto';

const ORIGIN='https://thebedesk.com';
const REGISTER_URL=`${ORIGIN}/api/auth/register`;
const SYNTHETIC_EMAIL_RE=/^synthetic\.lifecycle\.\d+\.\d+\.[0-9a-f]{12}@example\.invalid$/;
const LATE_READY_RETRY_RELEASE='20261015-workspace-late-ready-retry-v0519';
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');

if(auditSecret.length<32)throw new Error('Synthetic HOLD wrapper requires AUDIT_INTEGRITY_SECRET');

const realFetch=globalThis.fetch;
if(typeof realFetch!=='function')throw new Error('Synthetic HOLD wrapper requires global fetch');

function isLateReadyWorkspaceDiagnostic(error){
  const text=String(error?.message||error||'');
  return text.includes('workspace authored-readiness timeout')&&
    text.includes('gates={"workspaceReady":true')&&
    text.includes('"shell":true')&&
    text.includes('"shellHiddenAttribute":false')&&
    text.includes('"shellHiddenClass":false')&&
    text.includes('"shellDisplay":""')&&
    text.includes('"shellVisibility":"visible"')&&
    text.includes('"marketingHidden":true')&&
    text.includes('"authHidden":true')&&
    text.includes('"sidebar":true');
}

const priorProofDescriptor=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
function installBoundedLateReadyProof(originalProof){
  if(typeof originalProof!=='function')throw new Error('Synthetic HOLD wrapper browser proof assignment was not a function');
  const boundedProof=async credentials=>{
    try{
      return await originalProof(credentials);
    }catch(error){
      if(!isLateReadyWorkspaceDiagnostic(error))throw error;
      console.log(`INFO ${LATE_READY_RETRY_RELEASE}: authored workspace became ready during bounded timeout diagnostics; retrying canonical browser proof once`);
      return originalProof(credentials);
    }
  };
  if(typeof priorProofDescriptor?.set==='function'){
    priorProofDescriptor.set.call(globalThis,boundedProof);
    return;
  }
  Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{configurable:true,writable:true,value:boundedProof});
}
Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{configurable:true,set:installBoundedLateReadyProof});

globalThis.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:String(input?.url||'');
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(url===REGISTER_URL&&method==='POST'){
    let payload=null;
    try{payload=JSON.parse(String(init?.body||''))}catch{}
    const email=String(payload?.email||'').trim().toLowerCase();
    if(!SYNTHETIC_EMAIL_RE.test(email))throw new Error('Synthetic HOLD wrapper refused non-synthetic registration identity');
    const signature=crypto.createHmac('sha256',auditSecret).update(`registration-override:${email}`).digest('hex');
    const headers=new Headers(init?.headers||{});
    headers.set('x-thebe-registration-audit',signature);
    return realFetch(input,{...init,headers});
  }
  return realFetch(input,init);
};

try{
  await import('./production-synthetic-browser-wrapper.mjs');
}finally{
  globalThis.fetch=realFetch;
  const current=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
  if(current?.set===installBoundedLateReadyProof){
    if(priorProofDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorProofDescriptor);
    else delete globalThis.__thebeSyntheticBrowserProof;
  }
}
