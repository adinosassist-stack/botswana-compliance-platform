import {handleGeneralAiRoute} from "./general-ai-route.js";

const reply=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const encoder=new TextEncoder();
const toHex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
function sessionCookie(request){
  const cookie=request.headers.get("cookie")||"";
  for(const part of cookie.split(";")){
    const [name,...parts]=part.trim().split("=");
    if(name==="__Host-bw_session"||name==="bw_session"){
      const value=parts.join("=");
      return value&&value.length<=1024?value:null;
    }
  }
  return null;
}
async function authenticate(request,env){
  const raw=sessionCookie(request);
  if(!raw||!env?.SESSION_SECRET||!env?.DB?.prepare)return null;
  const key=await crypto.subtle.importKey("raw",encoder.encode(String(env.SESSION_SECRET)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const hash=toHex(await crypto.subtle.sign("HMAC",key,encoder.encode(raw)));
  return env.DB.prepare(`SELECT s.user_id,s.tenant_id,s.csrf_token,m.role,u.email
    FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active'
    WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1`).bind(hash).first();
}
export async function readDockResearchFixture(request, env) {
  if (env?.APP_ENV !== "staging" || !env.DOCK_RESEARCH_FIXTURE_USER_ID ||
      !env.DOCK_RESEARCH_FIXTURE_TENANT_ID) return null;
  const session = await authenticate(request, env);
  return session &&
    session.user_id === env.DOCK_RESEARCH_FIXTURE_USER_ID &&
    session.tenant_id === env.DOCK_RESEARCH_FIXTURE_TENANT_ID &&
    typeof session.email === "string" && session.email.endsWith(".invalid") ? session : null;
}

export async function verifyDockResearchFixture(request, env, csrf) {
  const session = await readDockResearchFixture(request, env);
  return Boolean(session && typeof csrf === "string" && csrf.length > 0 && session.csrf_token === csrf);
}

export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path!=="/api/ai/general")return reply(404,"not_found");
    if(request.method!=="POST")return reply(405,"method_not_allowed");
    if(env?.APP_ENV!=="staging"||env?.THEBE_GENERAL_AI_ENABLED!=="true")return reply(404,"feature_disabled");
    try{
      const auth=await authenticate(request,env);
      return await handleGeneralAiRoute({request,path,env,auth});
    }catch{return reply(503,"staging_auth_unavailable")}
  }
};
