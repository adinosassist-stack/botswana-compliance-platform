import {readMotsheloGroupSummary} from '../../server/thebe-life/d1-motshelo-group-summary.mjs';
import {readMotsheloContributions} from '../../server/thebe-life/d1-motshelo-reader.mjs';

// NOT mounted in any production Worker. Upstream must independently verify
// the server session and entitlement; these checks are defense in depth.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const PATH=/^\/api\/life\/motshelo\/([A-Za-z0-9_-]{1,80})\/(summary|contributions)$/;
const response=(body,status)=>Response.json(body,{status,headers:{
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'x-robots-tag':'noindex, nofollow','vary':'Cookie'
}});
export async function handleThebeLifeMotsheloReadRoute({request,path,env,auth}={}){
  const match=typeof path==='string'&&PATH.exec(path);
  if(!match)return null;
  if(request?.method!=='GET')return response({error:'method_not_allowed'},405);
  if(env?.THEBE_LIFE_MOTSHELO_READ_ENABLED!=='true')return response({error:'feature_disabled'},404);
  if(typeof auth?.user_id!=='string'||!ID.test(auth.user_id))return response({error:'unauthenticated'},401);
  if(auth.session_verified!==true||auth.life_entitled!==true)return response({error:'not_authorized'},403);
  if(!env?.LIFE_DB||typeof env.LIFE_DB.prepare!=='function')return response({error:'storage_unavailable'},503);
  let origin;
  try{
    origin=new URL(String(env.PUBLIC_ORIGIN||'')).origin;
    if(origin==='null'||!String(env.PUBLIC_ORIGIN).startsWith('https://'))throw new Error('bad_origin');
  }catch{return response({error:'origin_config_unavailable'},503);}
  let url;
  try{url=new URL(request.url);}catch{return response({error:'invalid_url'},400);}
  if(url.origin!==origin)return response({error:'wrong_origin'},403);
  if(url.pathname!==path||url.search)return response({error:'unexpected_request_target'},400);
  const supplied=request.headers.get('origin');
  if(supplied&&supplied!==origin)return response({error:'origin_denied'},403);
  if(typeof env.LIFE_RATE_LIMITER?.limit!=='function')return response({error:'rate_limiter_unavailable'},503);
  try{
    const limit=await env.LIFE_RATE_LIMITER.limit({key:'life:motshelo:'+auth.user_id+':'+match[1]});
    if(limit?.success!==true)return response({error:'rate_limited'},429);
  }catch{return response({error:'rate_limiter_unavailable'},503);}
  try{
    const args={db:env.LIFE_DB,groupId:match[1],sessionUserId:auth.user_id};
    const summary=await readMotsheloGroupSummary(args);
    if(summary.ok===false)return response({error:'not_authorized_or_not_found'},404);
    const result=match[2]==='summary'
      ?summary
      :await readMotsheloContributions({...args,limit:50});
    // No ledger record may be presented as bank-confirmed funds.
    return response(result,200);
  }catch{return response({error:'life_read_unavailable'},503);}
}
