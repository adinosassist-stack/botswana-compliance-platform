import crypto from 'node:crypto';

const BASE='https://thebedesk.com';
const transports={
  root:path=>{const u=new URL('/',BASE);u.searchParams.set('__thebe_api_path',path);return u.toString()},
  shadow:path=>new URL(path==='/api'?'/__thebe_api':`/__thebe_api${path.slice(4)}`,BASE).toString(),
  direct:path=>new URL(path,BASE).toString()
};

async function bodyJson(response){
  const text=await response.text();
  try{return text?JSON.parse(text):{}}catch{return {raw:text.slice(0,240)}}
}
async function postJson(url,payload={}){
  const response=await fetch(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json',origin:BASE},body:JSON.stringify(payload),redirect:'manual'});
  return {status:response.status,headers:Object.fromEntries(response.headers),body:await bodyJson(response)};
}
function leadingZeroBits(buffer,bits){
  let remaining=Number(bits)||0;
  for(const value of buffer){
    if(remaining<=0)return true;
    const take=Math.min(8,remaining);
    if((value>>(8-take))!==0)return false;
    remaining-=take;
  }
  return remaining<=0;
}
async function solveProof(token,difficulty){
  for(let counter=0;counter<=500000;counter++){
    const digest=crypto.createHash('sha256').update(`${token}:${counter}`).digest();
    if(leadingZeroBits(digest,difficulty))return JSON.stringify({challenge:token,counter,honeypot:''});
  }
  throw new Error('proof solver exceeded counter bound');
}
function compact(value){return JSON.stringify(value)}

const live=await fetch(`${BASE}/api/live`,{headers:{accept:'application/json'},redirect:'manual'});
const liveBody=await bodyJson(live);
console.log(`LIVE status=${live.status} body=${compact(liveBody)}`);
const ready=await fetch(`${BASE}/api/ready`,{headers:{accept:'application/json'},redirect:'manual'});
const readyBody=await bodyJson(ready);
console.log(`READY status=${ready.status} body=${compact(readyBody)}`);

let failures=0;
for(const [name,build] of Object.entries(transports)){
  const probe=await postJson(build('/api/auth/register-transport-probe'));
  console.log(`TRANSPORT ${name} probe status=${probe.status} body=${compact(probe.body)}`);
  if(probe.status!==200||probe.body?.ok!==true)failures++;
}

// Root tunnel is the default non-idempotent transport used by the shipped registration client.
const challenge=await postJson(transports.root('/api/auth/registration-proof/challenge'));
console.log(`ROOT challenge status=${challenge.status} provider=${String(challenge.body?.provider||'')} difficulty=${Number(challenge.body?.difficulty||0)} error=${String(challenge.body?.error||'')}`);
if(challenge.status!==200||!challenge.body?.token){
  failures++;
}else{
  const proof=await solveProof(String(challenge.body.token),Number(challenge.body.difficulty));
  const invalid=await postJson(transports.root('/api/auth/register'),{
    companyName:'QA registration boundary',
    email:'invalid-email-for-nonmutating-audit',
    password:'short',
    turnstileToken:proof
  });
  console.log(`ROOT verified-invalid-register status=${invalid.status} error=${String(invalid.body?.error||'')} message=${String(invalid.body?.message||'').slice(0,180)}`);
  // A valid proof must reach inner validation. This must be 400 invalid_registration and must not create data.
  if(invalid.status!==400||invalid.body?.error!=='invalid_registration')failures++;
}

if(live.status!==200||liveBody?.ok!==true)failures++;
if(ready.status!==200||readyBody?.ok!==true)failures++;
if(failures){
  console.error(`LIVE_REGISTRATION_AUDIT_FAIL failures=${failures}`);
  process.exit(1);
}
console.log('LIVE_REGISTRATION_AUDIT_PASS');
