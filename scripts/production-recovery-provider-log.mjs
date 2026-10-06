import {pathToFileURL} from 'node:url';

const ERROR_NAMES=new Set(['validation_error','missing_api_key','restricted_api_key','suspended_api_key','invalid_permission','daily_quota_exceeded','monthly_quota_exceeded','rate_limit_exceeded','invalid_idempotency_key','invalid_idempotent_request','concurrent_idempotent_requests','application_error','service_unavailable']);
export function summarizeRecoveryLog(log){
  const request=log?.request_body;
  if(log?.endpoint!=='/emails'||log?.method!=='POST'||request?.subject!=='Reset your Thebe Desk password'||!Array.isArray(request?.to)||request.to.length!==1||request.to[0]!=='delivered@resend.dev')return null;
  const status=Number(log.response_status);
  if(!Number.isInteger(status)||status<100||status>599)return null;
  const error=log.response_body||{};
  const name=ERROR_NAMES.has(error.name)?error.name:'unknown';
  const message=String(error.message||'').toLowerCase();
  let reason=status<400?'accepted':'unclassified';
  if(status>=400){
    if(/quota|limit.*exceeded/.test(message))reason='quota';
    else if(/not verified|verify.*domain/.test(message))reason='domain';
    else if(/invalid.*from|from.*invalid/.test(message))reason='sender_format';
    else if(/api key|permission|scope|not authorized/.test(message))reason='key_permission';
    else if(/testing emails/.test(message))reason='testing_restriction';
  }
  return {status,error:name,reason};
}

export async function readRecoveryProviderFailure({resendKey,since,fetchImpl=fetch}){
  const threshold=Date.parse(since);
  if(!Number.isFinite(threshold))throw new Error('invalid diagnostic time boundary');
  const get=async path=>{
    const response=await fetchImpl('https://api.resend.com'+path,{method:'GET',redirect:'error',headers:{authorization:`Bearer ${resendKey}`,accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return {httpStatus:response.status};
    const text=await response.text();
    if(text.length>1024*1024)throw new Error('diagnostic response too large');
    return JSON.parse(text);
  };
  const recent=[];
  let cursor='';
  for(let page=0;page<5;page++){
    const listing=await get('/logs'+(cursor?'?after='+encodeURIComponent(cursor):''));
    if(listing.httpStatus)return {result:'logs_unavailable',status:listing.httpStatus};
    const items=Array.isArray(listing.data)?listing.data:[];
    recent.push(...items.filter(x=>Date.parse(x.created_at)>=threshold));
    const last=items.at(-1);
    if(!listing.has_more||!last||Date.parse(last.created_at)<threshold||!/^[0-9a-f-]{36}$/i.test(String(last.id||''))||last.id===cursor)break;
    cursor=last.id;
  }
  const candidates=recent.filter(x=>x?.endpoint==='/emails'&&x?.method==='POST').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,10);
  for(const item of candidates){
    if(!/^[0-9a-f-]{36}$/i.test(String(item.id||'')))continue;
    const detail=await get('/logs/'+item.id);
    if(detail.httpStatus)return {result:'detail_unavailable',status:detail.httpStatus};
    if(Date.parse(detail.created_at)<threshold||!Number.isFinite(Date.parse(detail.created_at)))continue;
    const summary=summarizeRecoveryLog(detail);
    if(summary)return {result:'synthetic_reset_send',...summary};
  }
  return {result:'no_matching_synthetic_send',examined:candidates.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.RESEND_API_KEY)throw new Error('diagnostic requires governed GitHub Actions secrets');
  try{
    const result=await readRecoveryProviderFailure({resendKey:process.env.RESEND_API_KEY,since:'2026-10-06T20:05:00Z'});
    console.log('RECOVERY_PROVIDER_DIAGNOSTIC '+JSON.stringify(result));
  }catch{
    console.error('RECOVERY_PROVIDER_DIAGNOSTIC unavailable');process.exitCode=1;
  }
}
