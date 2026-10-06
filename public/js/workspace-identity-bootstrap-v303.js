(()=>{
  "use strict";
  const node=document.getElementById("thebe-initial-workspace-identity");
  if(!node)return;
  let payload=null;
  try{payload=JSON.parse(node.textContent||"")}catch{}
  if(!payload||!payload.user||typeof payload.user!=="object"||!String(payload.user.role||"")||!String(payload.csrfToken||""))return;

  const nativeFetch=window.fetch.bind(window);
  let consumed=false;
  function logicalPath(raw){
    try{
      const url=new URL(typeof raw==="string"?raw:raw?.url||"",window.location.href);
      if(url.origin!==window.location.origin)return "";
      if(url.pathname==="/")return String(url.searchParams.get("__thebe_api_path")||"");
      if(url.pathname==="/__thebe_api")return "/api";
      if(url.pathname.startsWith("/__thebe_api/"))return `/api/${url.pathname.slice("/__thebe_api/".length)}`;
      return url.pathname;
    }catch{return ""}
  }
  window.fetch=async function(input,init={}){
    const method=String(init?.method||input?.method||"GET").toUpperCase();
    if(!consumed&&method==="GET"&&logicalPath(input)==="/api/auth/me"){
      consumed=true;
      window.fetch=nativeFetch;
      try{node.remove()}catch{}
      return new Response(JSON.stringify(payload),{
        status:200,
        headers:{
          "content-type":"application/json; charset=utf-8",
          "cache-control":"no-store",
          "x-content-type-options":"nosniff",
          "x-thebe-identity-bootstrap":"server-authorized-v1"
        }
      });
    }
    return nativeFetch(input,init);
  };
})();
