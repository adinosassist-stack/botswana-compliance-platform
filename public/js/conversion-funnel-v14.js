(()=>{
  "use strict";
  const STORAGE_KEY="thebe_conversion_id";
  const SOURCE_KEY="thebe_conversion_source";
  const PLAN_KEY="thebe_conversion_plan";
  const COOKIE_NAME="thebe_cv";
  const ENDPOINT="/api/marketing/conversion-event";
  const ID_RE=/^[a-zA-Z0-9_-]{16,64}$/;
  let apiClient;
  const registerMode=()=>new URLSearchParams(location.search).get("mode")==="register"||document.getElementById("companyNameField")?.hidden===false;

  function generatedId(){
    if(typeof crypto?.randomUUID==="function")return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(18));
    return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  }
  function stored(key){try{return String(sessionStorage.getItem(key)||"")}catch{return ""}}
  function store(key,value){try{sessionStorage.setItem(key,String(value||""))}catch{}}
  function cookieId(){
    const prefix=COOKIE_NAME+"=";
    const item=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(prefix));
    if(!item)return "";
    try{return decodeURIComponent(item.slice(prefix.length))}catch{return item.slice(prefix.length)}
  }
  function conversionId(){
    let value=stored(STORAGE_KEY);
    if(!ID_RE.test(value))value=cookieId();
    if(!ID_RE.test(value))value=generatedId();
    store(STORAGE_KEY,value);
    return value;
  }
  function armCookie(){
    const value=conversionId();
    document.cookie=`${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=1800; SameSite=Lax; Secure`;
  }
  function inferSource(anchor){
    const explicit=String(anchor?.dataset?.ctaSource||"");
    if(explicit)return explicit;
    if(anchor?.closest?.(".hero"))return "hero";
    if(anchor?.closest?.(".nav"))return "nav";
    if(anchor?.closest?.("#product"))return "product";
    if(anchor?.closest?.("#pricing"))return "pricing";
    if(anchor?.closest?.(".mobile-sticky"))return "mobile-sticky";
    if(anchor?.closest?.(".final"))return "final";
    return "unknown";
  }
  function inferPlan(anchor){
    const explicit=String(anchor?.dataset?.plan||"");
    if(explicit)return explicit;
    try{return new URL(anchor?.href||location.href,location.href).searchParams.get("plan")||""}catch{return ""}
  }
  function currentAttribution(){
    const params=new URLSearchParams(location.search);
    return {source:stored(SOURCE_KEY)||"market",plan:params.get("plan")||stored(PLAN_KEY)||""};
  }
  function emit(stage,extra={}){
    const payload={conversionId:conversionId(),stage,source:String(extra.source||"market"),plan:String(extra.plan||""),path:location.pathname};
    try{
      apiClient=apiClient||window.BW?.api?.createClient?.({retries:0,timeoutMs:5000});
      if(apiClient)void apiClient.request(ENDPOINT,{method:"POST",keepalive:true,body:JSON.stringify(payload)}).catch(()=>{});
    }catch{}
  }
  function marketInit(){
    emit("market_view",{source:"market"});
    document.addEventListener("click",event=>{
      const anchor=event.target?.closest?.("a.marketing-start-action");
      if(!anchor)return;
      const source=inferSource(anchor),plan=inferPlan(anchor);
      store(SOURCE_KEY,source);store(PLAN_KEY,plan);armCookie();
      emit("cta_click",{source,plan});
    },true);
  }
  function authInit(){
    let registrationViewed=false;
    const view=()=>{
      if(!registerMode()||registrationViewed)return;
      registrationViewed=true;armCookie();emit("registration_view",currentAttribution());
    };
    const bind=()=>{
      view();
      document.getElementById("registerTab")?.addEventListener("click",()=>setTimeout(view,0));
      document.getElementById("authForm")?.addEventListener("submit",()=>{
        if(!registerMode())return;
        armCookie();emit("registration_submit",currentAttribution());
      },true);
    };
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
  }

  if(location.pathname==="/"||location.pathname==="/home"||location.pathname==="/home.html"){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",marketInit,{once:true});else marketInit();
  }
  else if(location.pathname==="/auth/"||location.pathname==="/auth")authInit();
})();
