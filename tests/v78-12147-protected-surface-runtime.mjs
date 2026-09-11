import worker from "../cloudflare/src/worker.js";
class NullStmt{bind(){return this}async first(){return null}async all(){return {results:[]}}async run(){return {meta:{changes:0}}}}
class NullDB{prepare(){return new NullStmt()}}
const env={DB:new NullDB(),ASSETS:{fetch:async()=>new Response("asset")},SESSION_SECRET:"s".repeat(48),PUBLIC_ORIGIN:"https://app.example"};
const routes=[
 ["GET","/api/state"],["PUT","/api/state"],["GET","/api/obligations"],["POST","/api/obligations/demo/advance"],
 ["GET","/api/employees"],["POST","/api/employees"],["GET","/api/tenders"],["POST","/api/tenders"],
 ["GET","/api/evidence/integrity"],["POST","/api/evidence/presign"],["GET","/api/ai/credits"],["POST","/api/ai/advisor"],
 ["GET","/api/payments/orders"],["POST","/api/payments/subscription-checkout"],["GET","/api/notifications"],["POST","/api/workflow-rules"],
 ["GET","/api/passport"],["POST","/api/passport/shares"],["GET","/api/hr/cases"],["POST","/api/hr/cases"],
 ["GET","/api/daily-reporting/dashboard"],["GET","/api/control-center"],["GET","/api/business-risk-events"],["GET","/api/account/export"]
];
let checks=0;
for(const [method,path] of routes){
 const init={method,headers:{origin:"https://app.example"}};if(!["GET","HEAD"].includes(method)){init.headers["content-type"]="application/json";init.body="{}"}
 const res=await worker.fetch(new Request("https://app.example"+path,init),env,{});const body=await res.json().catch(()=>({}));
 checks++;if(res.status!==401||body.error!=="unauthenticated")throw new Error(`Protected route escaped auth gate: ${method} ${path} -> ${res.status} ${JSON.stringify(body)}`);
}
console.log(`V78 1.21.47 protected feature surface runtime: ${checks}/${checks} PASS`);
