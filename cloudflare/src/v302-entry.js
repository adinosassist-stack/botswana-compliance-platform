import releaseGovernance,{injectWorkspaceBoundaryScript,normalizeWorkspaceAssetUrls} from "./release-governance-entry.js";

const APP_PATH="/app/";
const AUTH_PATH="/api/auth/me";
const LEGACY_WORKSPACE_PARAM="desktop-owner-proof";
const BOOTSTRAP_ID="thebe-initial-auth-v302";
const BOOTSTRAP_SCRIPT="/js/workspace-auth-bootstrap-v302.js?v=20261006-v302";
const WORKSPACE_RUNTIME_MARKER='<script id="thebe-workspace-runtime"';

function logicalPath(request){try{return new URL(request.url).pathname}catch{return ""}}

function safeEmbeddedJson(value){
  const json=JSON.stringify(value);
  if(typeof json!=="string"||new TextEncoder().encode(json).byteLength>128*1024)return "";
  return json
    .replaceAll("&","\\u0026")
    .replaceAll("<","\\u003c")
    .replaceAll(">","\\u003e")
    .replaceAll("\u2028","\\u2028")
    .replaceAll("\u2029","\\u2029");
}

function unavailableResponse(){
  return new Response("Thebe Desk workspace is temporarily unavailable. The public site remains available at https://thebedesk.com/.",{status:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","retry-after":"30"}});
}

function loginRedirect(request){
  const current=new URL(request.url),target=new URL("/auth/",request.url);
  target.searchParams.set("mode","login");
  target.searchParams.set("next",current.pathname+current.search);
  return Response.redirect(target.toString(),302);
}

function injectBootstrap(html,payload){
  const source=normalizeWorkspaceAssetUrls(injectWorkspaceBoundaryScript(String(html||"")));
  if(source.includes(`id="${BOOTSTRAP_ID}"`))return source;
  const serialized=safeEmbeddedJson(payload);
  const marker=source.indexOf(WORKSPACE_RUNTIME_MARKER);
  if(!serialized||marker<0)return "";
  const markup=`<script type="application/json" id="${BOOTSTRAP_ID}">${serialized}</script>\n<script src="${BOOTSTRAP_SCRIPT}" defer></script>\n`;
  return source.slice(0,marker)+markup+source.slice(marker);
}

async function authenticatedWorkspaceResponse(request,env,ctx){
  const authUrl=new URL(AUTH_PATH,request.url),authHeaders=new Headers(request.headers);
  authHeaders.set("accept","application/json");
  const authResponse=await releaseGovernance.fetch(new Request(authUrl.toString(),{method:"GET",headers:authHeaders,redirect:"manual"}),env,ctx);
  if(authResponse.status===401||authResponse.status===403)return loginRedirect(request);
  if(!authResponse.ok)return unavailableResponse();

  let bootstrap=null;
  try{bootstrap=await authResponse.json()}catch{return unavailableResponse()}
  if(!bootstrap?.user?.id||!bootstrap?.user?.role||typeof bootstrap?.csrfToken!=="string"||!bootstrap.csrfToken)return unavailableResponse();

  const shellUrl=new URL(request.url);
  shellUrl.pathname="/";
  shellUrl.searchParams.set(LEGACY_WORKSPACE_PARAM,"v302");
  const shell=await releaseGovernance.fetch(new Request(shellUrl.toString(),request),env,ctx);
  const headers=new Headers(shell.headers);
  headers.set("x-thebe-surface","app");
  headers.set("x-thebe-surface-boundary","workspace-v1");
  headers.set("x-thebe-auth-bootstrap","embedded-v302");
  headers.set("x-robots-tag","noindex, nofollow");
  headers.set("cache-control","no-store");
  headers.delete("content-length");headers.delete("etag");

  if(request.method==="HEAD")return new Response(null,{status:shell.status,statusText:shell.statusText,headers});
  if(!shell.ok||!String(shell.headers.get("content-type")||"").toLowerCase().includes("text/html"))return unavailableResponse();

  const html=injectBootstrap(await shell.text(),bootstrap);
  if(!html)return unavailableResponse();
  headers.set("content-type","text/html; charset=utf-8");
  return new Response(html,{status:shell.status,statusText:shell.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    if(["GET","HEAD"].includes(request.method)&&logicalPath(request)===APP_PATH)return authenticatedWorkspaceResponse(request,env,ctx);
    return releaseGovernance.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return releaseGovernance.scheduled(event,env,ctx)}
};

export {BOOTSTRAP_ID,BOOTSTRAP_SCRIPT,injectBootstrap,logicalPath,safeEmbeddedJson};
