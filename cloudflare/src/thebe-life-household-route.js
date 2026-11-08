import {readHouseholdEntries} from '../../server/thebe-life/d1-household-reader.mjs';
import {recordHouseholdEntry} from '../../server/thebe-life/d1-household-writer.mjs';

// NOT attached to production Worker dispatch. Route-specific checks are defense
// in depth; canonical session, Origin and CSRF validation must run upstream.
const respond=(data,status)=>Response.json(data,{status,headers:{
  'cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'
}});
const ID=/^[A-Za-z0-9_-]{1,80}$/;
async function boundedBody(request){
  const contentType=(request.headers.get('content-type')||'').toLowerCase();
  if(!/^application\/json(?:\s*;|$)/.test(contentType))return {error:'content_type_required'};
  const size=request.headers.get('content-length');
  if(size!==null&&(!/^\d+$/.test(size)||Number(size)>4096))return {error:'invalid_body_size'};
  let body;
  try {
    const content=await request.text();
    if(new TextEncoder().encode(content).byteLength>4096)return {error:'invalid_body_size'};
    body=JSON.parse(content);
  }catch{return {error:'invalid_json'};}
  if(!body||typeof body!=='object'||Array.isArray(body))return {error:'invalid_json'};
  return {body};
}
export async function handleThebeLifeHouseholdRoute({request,path,env,auth}={}){
  if(typeof path!=='string'||!/^\/api\/life\/households\/[A-Za-z0-9_-]{1,80}\/entries$/.test(path))return null;
  if(!['GET','POST'].includes(request?.method))return respond({error:'method_not_allowed'},405);
  // Flag, session, personal-Life entitlement and dedicated D1 binding all fail closed.
  if(env?.THEBE_LIFE_HOUSEHOLD_ENABLED!=='true')return respond({error:'feature_disabled'},404);
  if(typeof auth?.user_id!=='string'||!ID.test(auth.user_id))return respond({error:'unauthenticated'},401);
  if(auth.life_entitled!==true||auth.session_verified!==true)return respond({error:'life_not_authorized'},403);
  if(!env?.LIFE_DB||typeof env.LIFE_DB.prepare!=='function')return respond({error:'life_storage_unavailable'},503);
  let expected;
  try{expected=new URL(String(env.PUBLIC_ORIGIN||'')).origin;}catch{return respond({error:'origin_configuration_missing'},503);}
  const requestUrl=new URL(request.url);
  if(requestUrl.origin!==expected)return respond({error:'wrong_request_origin'},403);
  const origin=request.headers.get('origin');
  // Browser mutations must carry Origin; browser reads may be same-origin without it.
  if(origin&&origin!==expected)return respond({error:'origin_failed'},403);
  if(request.method==='POST'){
    if(origin!==expected)return respond({error:'origin_required'},403);
    if(typeof auth.csrf_token!=='string'||auth.csrf_token.length<16||request.headers.get('x-csrf-token')!==auth.csrf_token)
      return respond({error:'csrf_failed'},403);
  }
  const householdId=path.split('/')[4];
  if(!ID.test(householdId))return respond({error:'invalid_household'},400);
  if(requestUrl.search)return respond({error:'unexpected_query'},400);
  if(typeof env.LIFE_RATE_LIMITER?.limit!=='function')return respond({error:'rate_limiter_unavailable'},503);
  try{
    const limit=await env.LIFE_RATE_LIMITER.limit({key:'life:'+auth.user_id+':'+householdId});
    if(limit?.success!==true)return respond({error:'rate_limit_exceeded'},429);
  }catch{return respond({error:'rate_limiter_unavailable'},503);}
  try{
    if(request.method==='GET'){
      const result=await readHouseholdEntries({db:env.LIFE_DB,householdId,userId:auth.user_id,limit:50});
      return result.ok?respond(result,200):respond({error:'not_authorized'},403);
    }
    const parsed=await boundedBody(request);
    if(parsed.error)return respond({error:parsed.error},400);
    if(Object.keys(parsed.body).some(key=>key!=='entry'))return respond({error:'unexpected_fields'},400);
    const result=await recordHouseholdEntry({db:env.LIFE_DB,householdId,sessionUserId:auth.user_id,entry:parsed.body.entry});
    return result.created?respond({status:'recorded_not_bank_verified'},201):respond({error:'not_authorized_or_duplicate'},409);
  }catch(error){
    if(error instanceof TypeError||error instanceof RangeError)return respond({error:'invalid_entry'},400);
    return respond({error:'life_request_failed'},503);
  }
}
