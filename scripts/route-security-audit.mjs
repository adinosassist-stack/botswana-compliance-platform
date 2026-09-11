import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const worker=read("cloudflare/src/worker.js");
const policy=JSON.parse(read("cloudflare/config/route-security-policy.json"));
const gateIndex=worker.indexOf(policy.centralWorkspaceGate);
if(gateIndex<0)throw new Error("Central workspace API gate not found");
const pre=worker.slice(0,gateIndex),post=worker.slice(gateIndex);

const normalizeRegex=s=>s.replaceAll("\\/","/");
function methodsForContext(context){
  const list=context.match(/\[([^\]]+)\]\.includes\(req\.method\)/);
  if(list)return [...list[1].matchAll(/["']([A-Z]+)["']/g)].map(m=>m[1]);
  const m=context.match(/req\.method\s*===\s*["']([A-Z]+)["']/);
  return m?[m[1]]:["ANY"];
}
function discover(source){
  const found=[];
  const exact=/url\.pathname\s*===\s*["'](\/(?:api|public)\/[^"']*)["']/g;
  for(const m of source.matchAll(exact)){
    const lineStart=source.lastIndexOf("\n",m.index)+1,lineEnd=source.indexOf("\n",m.index);
    const context=source.slice(lineStart,lineEnd<0?source.length:lineEnd);
    for(const method of methodsForContext(context))found.push({kind:"exact",pattern:m[1],method,index:m.index});
  }
  const regex=/url\.pathname\.match\(\/(\^\\?\/(?:api|public)\\?\/.*?\$)\/\)/g;
  for(const m of source.matchAll(regex)){
    const lineStart=source.lastIndexOf("\n",m.index)+1,lineEnd=source.indexOf("\n",m.index);
    const context=source.slice(lineStart,lineEnd<0?source.length:lineEnd);
    for(const method of methodsForContext(context))found.push({kind:"regex",pattern:normalizeRegex(m[1]),method,index:m.index});
  }
  return found;
}
const key=r=>`${r.method}|${r.kind}|${r.pattern}`;
const discoveredPre=discover(pre);
const allowed=new Set(policy.preAuthRoutes.flatMap(r=>r.methods.map(method=>key({...r,method}))));
const discoveredKeys=new Set(discoveredPre.map(key));
const unexpected=discoveredPre.filter(r=>!allowed.has(key(r)));
const missing=[...allowed].filter(k=>!discoveredKeys.has(k));
if(unexpected.length)throw new Error(`Unclassified pre-auth route(s): ${unexpected.map(key).join(", ")}`);
if(missing.length)throw new Error(`Declared pre-auth route(s) missing from Worker: ${missing.join(", ")}`);

// Guard the security mechanisms protecting deliberately pre-authenticated surfaces.
const anchors={
  webhook_verification_token:["WHATSAPP_VERIFY_TOKEN","timingSafeText"],
  webhook_signature:["verifyWhatsAppWebhookSignature","WHATSAPP_APP_SECRET"],
  origin_rate_limit:["requestOriginAllowed","authRateLimit"],
  origin_token:["requestOriginAllowed","password_reset_tokens"],
  oauth_state:["encodeOauthState","oauthStateCookie"],
  oauth_state_cookie:["decodeOauthState","timingSafeText"],
  webhook_secret:["verifyWebhookSecret","payloadHash"],
  billing_secret:["x-billing-secret","timingSafeText"],
  billing_and_operations_secret:["x-billing-secret","x-operations-secret"],
  provider_verification_before_settlement:["verifyAndSettlePaymentOrder","Browser return recorded"],
  signed_access_token:["reporterAccessFromToken","token"],
  share_token_rate_limit:["passportShareRateLimited","shareToken"],
  signed_receipt_verification:["passport-receipt","timingSafeText"]
};
for(const route of policy.preAuthRoutes){
  for(const anchor of anchors[route.security]||[]){if(!pre.includes(anchor))throw new Error(`Missing ${route.security} security anchor ${anchor}`)}
}

// Every authenticated feature route must remain below the central gate and belong to a named feature family.
const workspaceRoutes=discover(post).filter(r=>r.pattern.includes("/api/"));
const prefixes=Object.entries(policy.workspaceFeaturePrefixes);
const familyFor=route=>{
  const candidate=route.kind==="regex"?route.pattern.replace(/^\^/,"").replaceAll("\\/","/"):route.pattern;
  return prefixes.find(([,list])=>list.some(prefix=>candidate.startsWith(prefix)))?.[0]||null;
};
const unclassifiedWorkspace=workspaceRoutes.filter(r=>!familyFor(r));
if(unclassifiedWorkspace.length){
  const unique=[...new Set(unclassifiedWorkspace.map(r=>`${r.kind}:${r.pattern}`))];
  throw new Error(`Authenticated route(s) missing feature inventory classification: ${unique.join(", ")}`);
}
const familyCounts={};for(const r of workspaceRoutes){const family=familyFor(r);familyCounts[family]=(familyCounts[family]||0)+1}
for(const required of ["account","audit","billing","obligations","employees_hr","tenders","evidence","regulatory","daily_reporting","passport","controls","risk","workspace","platform","cipa_registry","entitlements","inspections","payments","services","notifications","workflows","ai","business_events","legal_holds","licences"]){
  if(!familyCounts[required])throw new Error(`Feature inventory lost ${required} route coverage`);
}

const inventory={release:"1.21.101",generatedAt:new Date().toISOString(),centralGateOffset:gateIndex,preAuthRoutes:discoveredPre.map(({index,...r})=>r),authenticatedRouteCount:workspaceRoutes.length,featureFamilyCounts:familyCounts};
if(process.argv.includes("--write")){fs.mkdirSync(path.join(root,"dist"),{recursive:true});fs.writeFileSync(path.join(root,"dist/route-security-inventory.json"),JSON.stringify(inventory,null,2)+"\n");}
console.log(`Route security audit: ${discoveredPre.length} pre-auth method/routes allowlisted; ${workspaceRoutes.length} authenticated route branches classified across ${Object.keys(familyCounts).length} feature families — PASS`);
