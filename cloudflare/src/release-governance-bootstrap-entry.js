import governed from "./release-governance-entry.js";

const WORKSPACE_ROLES=new Set(["owner","manager","reviewer","auditor"]);
const IDENTITY_NODE_ID="thebe-initial-workspace-identity";
const IDENTITY_BOOTSTRAP_ASSET="/js/workspace-identity-bootstrap-v303.js?v=20261006-v303";
const WORKSPACE_RUNTIME_RE=/<script\b(?=[^>]*\bid=["']thebe-workspace-runtime["'])[^>]*><\/script>/i;
const MAX_IDENTITY_BYTES=32*1024;

function safeEmbeddedJson(value){
  const json=JSON.stringify(value);
  if(typeof json!=="string"||new TextEncoder().encode(json).byteLength>MAX_IDENTITY_BYTES)return "";
  return json
    .replaceAll("&","\\u0026")
    .replaceAll("<","\\u003c")
    .replaceAll(">","\\u003e")
    .replaceAll("\u2028","\\u2028")
    .replaceAll("\u2029","\\u2029");
}

async function serverAuthorizedIdentity(request,env,ctx){
  try{
    const url=new URL("/api/auth/me",request.url);
    const headers=new Headers(request.headers);
    headers.set("accept","application/json");
    const response=await governed.fetch(new Request(url.toString(),{method:"GET",headers,redirect:"manual"}),env,ctx);
    if(!response.ok||!String(response.headers.get("content-type")||"").toLowerCase().includes("application/json"))return null;
    const body=await response.json();
    const role=String(body?.user?.role||"");
    const csrfToken=String(body?.csrfToken||"");
    if(!WORKSPACE_ROLES.has(role)||csrfToken.length<16||!body?.user?.id)return null;
    return {user:body.user,csrfToken};
  }catch{return null}
}

function injectIdentityBootstrap(html,payload){
  const source=String(html||"");
  if(!payload||source.includes(`id="${IDENTITY_NODE_ID}"`)||source.includes(IDENTITY_BOOTSTRAP_ASSET.split("?",1)[0]))return source;
  const serialized=safeEmbeddedJson(payload);
  if(!serialized||!WORKSPACE_RUNTIME_RE.test(source))return source;
  const data=`<script type="application/json" id="${IDENTITY_NODE_ID}">${serialized}</script>\n`;
  const loader=`<script src="${IDENTITY_BOOTSTRAP_ASSET}" defer></script>\n`;
  return source.replace(WORKSPACE_RUNTIME_RE,match=>data+loader+match);
}

const wrapped={...governed};
wrapped.fetch=async function(request,env,ctx){
  const response=await governed.fetch(request,env,ctx);
  let url;
  try{url=new URL(request.url)}catch{return response}
  if(request.method!=="GET"||(url.pathname!=="/app"&&url.pathname!=="/app/"))return response;
  if(response.status!==200||!String(response.headers.get("content-type")||"").toLowerCase().includes("text/html"))return response;

  const identity=await serverAuthorizedIdentity(request,env,ctx);
  if(!identity)return response;
  try{
    const html=await response.clone().text();
    const injected=injectIdentityBootstrap(html,identity);
    if(injected===html)return response;
    const headers=new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("cache-control","no-store");
    headers.set("x-thebe-identity-bootstrap","server-authorized-v1");
    return new Response(injected,{status:response.status,statusText:response.statusText,headers});
  }catch{return response}
};

export default wrapped;
