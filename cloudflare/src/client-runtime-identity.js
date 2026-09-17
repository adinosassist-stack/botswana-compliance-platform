import releaseMetadata from "../../release/production.json" with {type:"json"};

export const CLIENT_TRANSPORT_IMPLEMENTATION="transport-fallback-race-v2";

function releaseSourceSha(){
  const sha=String(releaseMetadata?.sourceSha||"").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha)?sha:"unknown-source";
}

export function clientRuntimeRelease(){
  const sha=releaseSourceSha();
  const suffix=sha==="unknown-source"?sha:sha.slice(0,12);
  return `${CLIENT_TRANSPORT_IMPLEMENTATION}-${suffix}`;
}

export function runtimeScriptUrl(source,runtimeRelease=clientRuntimeRelease()){
  return String(source||"").replace(
    /(<script\b[^>]*\bsrc=["'])(\/?js\/api-client\.js)(?:\?[^"']*)?(["'][^>]*>)/gi,
    `$1$2?v=${runtimeRelease}$3`
  );
}

export async function applyClientRuntimeIdentity(request,response){
  const method=String(request?.method||"").toUpperCase();
  if(!["GET","HEAD"].includes(method))return response;
  let url;
  try{url=new URL(request.url)}catch{return response}
  const runtimeRelease=clientRuntimeRelease();
  const headers=new Headers(response.headers);

  if(url.pathname==="/js/api-client.js"){
    headers.set("cache-control","no-store, max-age=0, must-revalidate");
    headers.set("cdn-cache-control","no-store");
    headers.set("x-thebe-client-release",runtimeRelease);
    headers.set("x-thebe-client-implementation",CLIENT_TRANSPORT_IMPLEMENTATION);
    return new Response(method==="HEAD"?null:response.body,{status:response.status,statusText:response.statusText,headers});
  }

  if(!["/","/index.html"].includes(url.pathname))return response;
  const type=String(headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html"))return response;
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("cache-control","no-store, max-age=0, must-revalidate");
  headers.set("cdn-cache-control","no-store");
  headers.set("x-thebe-client-release",runtimeRelease);
  headers.set("x-thebe-client-implementation",CLIENT_TRANSPORT_IMPLEMENTATION);
  if(method==="HEAD")return new Response(null,{status:response.status,statusText:response.statusText,headers});
  const html=await response.text();
  const versioned=runtimeScriptUrl(html,runtimeRelease);
  return new Response(versioned,{status:response.status,statusText:response.statusText,headers});
}

export {releaseSourceSha};
