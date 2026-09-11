(function bootstrapBwPreview(global){
  "use strict";
  function previewGaboroneDate(){try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}}
  const PREVIEW_API=global.BW?.previewData||Object.freeze({});
  const registered=new Map();
  const roleEmails=new Map([["owner@preview.local","owner"],["manager@preview.local","manager"],["reviewer@preview.local","reviewer"],["auditor@preview.local","auditor"]]);
  const parseBody=opts=>{try{return JSON.parse(opts?.body||"{}")||{}}catch{return {}}};
  const previewUser=(email,role="owner",tenantId="preview-tenant",tenantName="Preview Business")=>({id:`preview-${role}`,email,displayName:`Preview ${role[0].toUpperCase()+role.slice(1)}`,role,tenantId,tenantName,onboardingComplete:true});
  const fail=(message,code="preview_error",status=400,data={})=>{const e=Object.assign(new Error(message),{code,status,data});throw e};
  function previewAuthResponse(key,method,opts){
    const body=parseBody(opts),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    if(key==="/api/auth/register"&&method==="POST"){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||String(body.companyName||"").trim().length<2)fail("Enter a valid email, an 8+ character password and a business name.","invalid_registration",400);
      registered.set(email,{role:"owner",tenantId:"preview-tenant",tenantName:String(body.companyName||"Preview Business").trim()});
      return {ok:true,message:"Preview account created. Opening the Owner workspace…"};
    }
    if(key==="/api/auth/login"&&method==="POST"){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)fail("Use a valid preview email and an 8+ character password.","invalid_credentials",401);
      if(email==="multi@preview.local"&&!body.tenantId)fail("Choose the workspace you want to open.","workspace_selection_required",409,{workspaces:[{tenantId:"preview-owner-workspace",tenantName:"Preview Owner Workspace",role:"owner"},{tenantId:"preview-manager-workspace",tenantName:"Preview Manager Workspace",role:"manager"}]});
      let role="owner",tenantId=String(body.tenantId||"preview-tenant"),tenantName="Preview Business";
      if(email==="multi@preview.local"){role=tenantId==="preview-manager-workspace"?"manager":"owner";tenantName=role==="manager"?"Preview Manager Workspace":"Preview Owner Workspace"}
      else if(registered.has(email)){const r=registered.get(email);role=r.role;tenantId=r.tenantId;tenantName=r.tenantName}
      else role=roleEmails.get(email)||"owner";
      return {ok:true,csrfToken:"preview-csrf",user:previewUser(email,role,tenantId,tenantName)};
    }
    if(key==="/api/auth/logout"&&method==="POST")return {ok:true};
    if(key==="/api/auth/anti-bot-config"&&method==="GET")return {provider:"turnstile",siteKey:"",action:"register",required:false};
    return null;
  }
  function previewResponse(url,opts={}){
    const method=String(opts.method||"GET").toUpperCase(),key=String(url).split("?")[0];
    const auth=previewAuthResponse(key,method,opts);if(auth)return auth;
    if(method==="POST"&&key==="/api/ai/advisor"){let body={};try{body=JSON.parse(opts.body||"{}")}catch{}const tenderMode=body.mode==="tender_readiness";return {runId:"preview-advisor",generationMode:"structured_fallback",model:null,creditsUsed:0,confidence:"medium",answer:tenderMode?"The preview workspace tracks one active tender with two mandatory readiness items still requiring review.":"The preview workspace shows one high-priority protection risk, two open obligations and three management follow-ups grounded in the demonstration records.",actions:[{title:tenderMode?"Review mandatory tender evidence":"Review the highest-priority workspace risk",reason:tenderMode?"Two mandatory readiness items are not yet verified in the preview record.":"The current risk record is marked high and needs management review.",priority:"high",sourceRefs:[tenderMode?"TND-1":"RISK-1"]}],caveats:["Preview response only; no live Workers AI request was made.","Verify workspace records and official sources before acting."],sourceRefs:[tenderMode?"TND-1":"RISK-1"],references:[{ref:tenderMode?"TND-1":"RISK-1",type:tenderMode?"tender":"risk_event",label:tenderMode?"Demo facilities tender":"Demo high-priority protection risk"}]};}
    if(method!=="GET")return {ok:true,id:"preview-"+Date.now(),status:"preview",priceBwp:500,message:"Preview only"};
    return structuredClone(PREVIEW_API[key]||{items:[]});
  }
  global.BW=global.BW||{};
  global.BW.preview=Object.freeze({request:previewResponse,roleEmails:Object.freeze(Object.fromEntries(roleEmails))});
})(window);
