function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}

export default {async fetch(req){
  const url=new URL(req.url);
  if(url.pathname==="/health"&&req.method==="GET"){
    return json({ok:false,enabled:false,provider:null,error:"scanner_provider_not_configured"},503);
  }
  if(url.pathname==="/scan"&&req.method==="POST"){
    return json({error:"scanner_provider_not_configured"},503);
  }
  return json({error:"not_found"},404);
}};

export const __scannerTest=Object.freeze({enabled:false,provider:null});
