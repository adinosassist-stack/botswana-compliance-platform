(()=>{
  const node=document.getElementById("thebe-initial-auth-v302");
  if(!node)return;
  let bootstrap=null;
  try{bootstrap=JSON.parse(node.textContent||"")}catch{return}
  if(!bootstrap?.user?.id||typeof bootstrap?.csrfToken!=="string"||!bootstrap.csrfToken)return;

  const nativeFetch=window.fetch.bind(window);
  let available=true;
  window.fetch=function(input,init){
    if(available){
      try{
        const request=input instanceof Request?input:null;
        const url=new URL(request?.url||String(input),window.location.href);
        const method=String(init?.method||request?.method||"GET").toUpperCase();
        if(method==="GET"&&url.origin===window.location.origin&&url.pathname==="/api/auth/me"){
          available=false;
          window.fetch=nativeFetch;
          node.remove();
          return Promise.resolve(new Response(JSON.stringify(bootstrap),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-thebe-auth-bootstrap":"embedded-v302"}}));
        }
      }catch{}
    }
    return nativeFetch(input,init);
  };
})();
