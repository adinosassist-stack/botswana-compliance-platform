import {readFileSync,openSync,writeFileSync,closeSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validateBillingStagingOwnerConfiguration} from './prepare-billing-staging-owner.mjs';

const ORIGIN='https://billing-staging.thebedesk.com';
const CUSTOMERS={alpha:'alpha.billing-staging@example.invalid',beta:'beta.billing-staging@example.invalid'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const demand=(ok,code)=>{if(!ok)throw Error(code)};

// Only the fixed staging origin is reachable. Passwords/cookies/CSRF and response
// bodies never enter the report. This is an API check, not browser/POP acceptance.
export async function checkBillingStagingAcceptance(options,{fetchImpl=fetch}={}){
 const ownerEmail=validateBillingStagingOwnerConfiguration({...options,email:options.ownerEmail});
 demand(!Object.values(CUSTOMERS).includes(ownerEmail),'acceptance_owner_configuration');
 for(const key of ['owner','alpha','beta'])demand(typeof options.passwords?.[key]==='string'&&options.passwords[key].length>=12&&options.passwords[key].length<=200&&!/[\r\n]/.test(options.passwords[key]),'acceptance_password_input');
 const report={version:1,kind:'billing-staging-readonly-api',origin:ORIGIN,sourceSha:options.sourceSha,startedAt:new Date().toISOString(),ok:false,checks:[],cleanupComplete:false,
  unverified:['browser-login-and-375px-layout','real-bank-reconciliation-and-activation','live-pop-upload-scan-retrieval-retirement','whatsapp-intake']};
 const sessions=new Map();let step='initial_identity';
 const check=(ok)=>{demand(ok,'acceptance_check_failed');report.checks.push(step)};
 async function send(path,{session,method='GET',body}={}){
  demand(path.startsWith('/api/')&&!path.includes('://'),'acceptance_route');
  const headers={origin:ORIGIN,'content-type':'application/json'};
  if(session){headers.cookie=session.cookie;headers['x-csrf-token']=session.csrf}
  let r;
  try{r=await fetchImpl(ORIGIN+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw Error('acceptance_transport_failed')}
  // Capture a newly issued session before checking provenance so failure cleanup
  // can still revoke it. Redirects are never followed with credentials.
  if(path==='/api/auth/login'&&r.status===200){
   const cookies=r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||''];
   const cookie=cookies.find(s=>s.startsWith('__Host-bw_session='))?.split(';')[0];
   demand(cookie&&cookie.length<2048,'acceptance_session_missing');
   sessions.set(body.email,{cookie,csrf:''});
  }
  demand(r.headers.get('x-thebe-source-sha')===options.sourceSha&&r.headers.get('x-thebe-billing-staging')==='read-only','acceptance_provenance_mismatch');
  demand(r.status<300||r.status>=400,'acceptance_redirect_refused');
  let data;
  try{const raw=await r.text();demand(raw.length<=1024*1024,'acceptance_response_size');data=JSON.parse(raw)}catch{throw Error('acceptance_response_invalid')}
  if(path==='/api/auth/login'&&r.status===200){const s=sessions.get(body.email);s.csrf=data.csrfToken;demand(typeof s.csrf==='string'&&s.csrf.length>0,'acceptance_csrf_missing')}
  return {status:r.status,data};
 }
 async function identity(){const r=await send('/api/billing-staging/status');check(r.status===200&&r.data.sourceSha===options.sourceSha&&r.data.mode==='read_only'&&['authenticatedAcceptance','billingMutationsEnabled','popUploadsEnabled','regulatoryActivationEnabled'].every(k=>r.data[k]===false))}
 async function logout(email){const session=sessions.get(email);if(!session)return;const r=await send('/api/auth/logout',{session,method:'POST',body:{}});demand(r.status===200&&r.data.ok===true,'acceptance_logout_failed');const me=await send('/api/auth/me',{session});demand(me.status===401&&me.data.error==='unauthenticated','acceptance_logout_not_revoked');sessions.delete(email)}
 try{
  await identity();
  step='anonymous_platform_denied';let r=await send('/api/platform/billing/subscriptions');check(r.status===401&&r.data.error==='unauthenticated');
  const users={};
  for(const [key,email] of Object.entries({owner:ownerEmail,...CUSTOMERS})){
   step=key+'_login';r=await send('/api/auth/login',{method:'POST',body:{email,password:options.passwords[key]}});check(r.status===200&&r.data.user?.email===email);
   step=key+'_identity';r=await send('/api/auth/me',{session:sessions.get(email)});check(r.status===200&&r.data.user?.email===email&&UUID.test(r.data.user.tenantId)&&r.data.user.platformBillingAdmin===(key==='owner'));users[key]=r.data.user;
   step=key+'_inactive_subscription';r=await send('/api/billing/status',{session:sessions.get(email)});check(r.status===200&&r.data.status==='inactive'&&r.data.current_period_ends_at===null);
  }
  step='distinct_tenant_sessions';check(new Set(Object.values(users).map(u=>u.tenantId)).size===3);
  const orderIds={};
  for(const [key,other] of [['alpha','beta'],['beta','alpha']]){
   const session=sessions.get(CUSTOMERS[key]);
   for(const suffix of ['', '?tenantId='+users[other].tenantId]){
    step=key+'_state'+(suffix?'_cross_tenant':'');r=await send('/api/state'+suffix,{session});check(r.status===200&&r.data.state?.billingStagingFixture===key);
    step=key+'_orders'+(suffix?'_cross_tenant':'');r=await send('/api/payments/orders'+suffix,{session});
    const item=r.data.items?.[0];check(r.status===200&&r.data.items?.length===1&&UUID.test(item?.id)&&item.status==='pending'&&item.amount_bwp===349&&item.provider==='manual_bank'&&item.paid_at===null&&item.provider_payment_id===null&&(!orderIds[key]||orderIds[key]===item.id));orderIds[key]=item.id;
   }
   for(const route of ['subscriptions','manual-payments','analytics']){step=key+'_platform_'+route+'_denied';r=await send('/api/platform/billing/'+route,{session});check(r.status===403&&r.data.error==='platform_billing_forbidden')}
   // Empty request has no file, order, idempotency key or bank assertion. Even
   // if the staging guard regresses it cannot authorize a valid upload/approval.
   step=key+'_upload_blocked';r=await send('/api/payments/manual-bank/pop/stage',{session,method:'POST',body:{}});check(r.status===403&&r.data.error==='billing_staging_mutations_disabled');
  }
  step='distinct_pending_orders';check(orderIds.alpha!==orderIds.beta);
  const owner=sessions.get(ownerEmail);
  step='owner_subscriptions';r=await send('/api/platform/billing/subscriptions',{session:owner});check(r.status===200&&Array.isArray(r.data.items)&&r.data.items.length===0&&r.data.counts?.active===0&&r.data.counts?.paused===0);
  step='owner_pending_queue';r=await send('/api/platform/billing/manual-payments',{session:owner});
  check(r.status===200&&r.data.total===2&&r.data.items?.length===2&&['alpha','beta'].every(key=>r.data.items.some(i=>i.payment_order_id===orderIds[key]&&i.tenant_id===users[key].tenantId&&i.status==='submitted'&&i.amount_bwp===349&&i.metadata?.synthetic===true&&i.bank_reference?.startsWith('STAGING-TEST-NO-FUNDS-'+key.toUpperCase()+'-'))));
  step='owner_analytics';r=await send('/api/platform/billing/analytics',{session:owner});check(r.status===200&&r.data.currency==='BWP'&&r.data.pending?.count===2&&r.data.pending?.amountBwp===698&&r.data.totalReceiptsBwp===0&&r.data.status?.inactive===3&&r.data.status?.active===0);
  step='alpha_logout_revoked';await logout(CUSTOMERS.alpha);check(true);
  step='beta_survives_alpha_logout';r=await send('/api/state',{session:sessions.get(CUSTOMERS.beta)});check(r.status===200&&r.data.state?.billingStagingFixture==='beta');
  step='owner_survives_alpha_logout';r=await send('/api/auth/me',{session:owner});check(r.status===200&&r.data.user?.email===ownerEmail&&r.data.user.platformBillingAdmin===true);
  step='final_identity';await identity();report.ok=true;
 }catch(error){report.failedCheck=step;report.failure=/^acceptance_[a-z_]+$/.test(error.message)?error.message:'acceptance_request_failed'}
 finally{
  let complete=true;for(const email of [...sessions.keys()])try{await logout(email)}catch{complete=false}
  report.cleanupComplete=complete;report.ok=report.ok&&complete;
  if(!complete){report.failure='acceptance_session_cleanup_failed';report.failedCheck||='session_cleanup'}
  report.finishedAt=new Date().toISOString();
 }
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let fd;
 try{
  const {values}=parseArgs({options:{config:{type:'string'},'owner-email':{type:'string'},database:{type:'string'},out:{type:'string'}}});
  demand(values.config&&values['owner-email']&&values.database&&values.out,'acceptance_arguments_required');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}).trim();
  const lines=readFileSync(0,'utf8').split('\n');if(lines.at(-1)==='')lines.pop();demand(lines.length===3,'acceptance_password_input');
  const options={config:JSON.parse(readFileSync(values.config,'utf8')),ownerEmail:values['owner-email'],expectedDatabaseId:values.database,productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,sourceSha,passwords:Object.fromEntries(['owner','alpha','beta'].map((key,i)=>[key,lines[i]]))};
  // Exclusive private report path is reserved before network access.
  fd=openSync(values.out,'wx',0o600);
  const report=await checkBillingStagingAcceptance(options);writeFileSync(fd,JSON.stringify(report,null,2)+'\n');
  console.log(report.ok?'Authenticated staging API checks passed; private report saved.':'Staging API check failed; inspect the private report.');process.exitCode=report.ok?0:1;
 }catch{console.error('billing_staging_acceptance_refused');process.exitCode=1}
 finally{if(fd!==undefined)closeSync(fd)}
}
