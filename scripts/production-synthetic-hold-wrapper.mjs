import crypto from 'node:crypto';

const ORIGIN='https://thebedesk.com';
const REGISTER_URL=`${ORIGIN}/api/auth/register`;
const SYNTHETIC_EMAIL_RE=/^synthetic\.lifecycle\.\d+\.\d+\.[0-9a-f]{12}@example\.invalid$/;
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');

if(auditSecret.length<32)throw new Error('Synthetic HOLD wrapper requires AUDIT_INTEGRITY_SECRET');

const realFetch=globalThis.fetch;
if(typeof realFetch!=='function')throw new Error('Synthetic HOLD wrapper requires global fetch');

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
}
