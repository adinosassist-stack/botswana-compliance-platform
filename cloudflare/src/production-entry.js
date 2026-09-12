import worker from "./worker.js";

const TURNSTILE_ORIGIN="https://challenges.cloudflare.com";
const META_CSP_RE=/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/i;

function turnstileCspReady(headers){
  const csp=String(headers?.get?.("content-security-policy")||"");
  return csp.includes(TURNSTILE_ORIGIN)&&csp.includes(`frame-src ${TURNSTILE_ORIGIN}`);
}

function stripConflictingMetaCsp(html){
  return String(html||"").replace(META_CSP_RE,"");
}

async function fetchWithTurnstileCspRepair(request,env,ctx){
  const response=await worker.fetch(request,env,ctx);
  if(request.method!=="GET")return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html")||!turnstileCspReady(response.headers))return response;
  const html=await response.clone().text();
  const repaired=stripConflictingMetaCsp(html);
  if(repaired===html)return response;
  const headers=new Headers(response.headers);
  headers.set("x-thebe-csp-meta","server-header-authoritative");
  return new Response(repaired,{status:response.status,statusText:response.statusText,headers});
}

export {stripConflictingMetaCsp,turnstileCspReady};

export default {
  fetch:fetchWithTurnstileCspRepair,
  async scheduled(event,env,ctx){
    return worker.scheduled(event,env,ctx);
  }
};
