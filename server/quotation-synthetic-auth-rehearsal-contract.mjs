/**
 * SOURCE-ONLY synthetic authenticated quotation rehearsal contract.
 * Deliberately NOT imported by the deployed or candidate Workflow.
 * Invocation requires a separately reviewed private operator and synthetic
 * D1 identity fixture; no production sessions, cookies or customer records.
 */
const ORIGIN="https://quotation.internal.example.test";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error("quotation_synthetic_rehearsal_not_qualified")};
const validSecret=s=>typeof s==="string"&&s.length>=32&&s.length<=256;
const safeResult=(checks)=>Object.freeze({mode:"OFFLINE_SYNTHETIC_ONLY",
 checks:Object.freeze([...checks]),customerData:false,productionWrites:0,
 deploymentAuthorized:false,executionAuthorized:false});
/** Never return cookies, CSRF values or response bodies. */
export async function runSyntheticQuotationDraftContract({
 qualification,service,sessionCookie,csrfToken,callerSecret,tenantId
}={}){
 if(qualification?.mode!=="offline-synthetic-test-double"||
    qualification?.noCloudflareRemoteWrites!==true||
    qualification?.productionResourcesAbsent!==true||
    qualification?.reviewedSyntheticFixture!==true||
    typeof service?.fetch!=="function"||!UUID.test(tenantId||"")||
    !validSecret(sessionCookie)||!validSecret(csrfToken)||
    !validSecret(callerSecret)||
    new Set([sessionCookie,csrfToken,callerSecret]).size!==3)fail();
 const headers=()=>({
  cookie:"__Host-bw_session="+sessionCookie,
  "x-quotation-private-caller":callerSecret,
  accept:"application/json"
 });
 const send=async (method,url,extra={},body)=>{
  const response=await service.fetch(new Request(ORIGIN+url,{
   method,headers:{...headers(),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})
  }));
  return response;
 };
 // Only fabricated information may be used, never copied customer records.
 const syntheticDraft={
  quoteNumber:"TEST-REHEARSAL-001",issueDate:"2026-11-17",
  customerName:"Synthetic Customer",customerContact:"Synthetic number only",
  items:[{description:"Concrete",quantity:1,unitPriceCents:150000},
   {description:"Grout 2kg",quantity:1,unitPriceCents:20000}],
  discountCents:0,paymentMethod:"Manual payment"
 };
 const path="/api/quotation/drafts",checks=[];
 const put=async(revision,token=csrfToken)=>send("PUT",path,
   {origin:ORIGIN,"x-csrf-token":token,"content-type":"application/json"},
   {draftId:"synthetic-rehearsal",revision,draft:syntheticDraft});
 const created=await put(0);
 if(created.status!==200)fail();
 const saved=await created.json();
 if(saved?.revision!==1)fail();
 checks.push("draft-create");
 const opened=await send("GET",path+"?id=synthetic-rehearsal");
 if(opened.status!==200)fail();
 const read=await opened.json();
 if(read?.revision!==1||read?.draft?.customerName!=="Synthetic Customer"||
  JSON.stringify(read?.draft?.items?.map(x=>x.description))!==
  JSON.stringify(["Concrete","Grout 2kg"]))fail();
 checks.push("draft-reopen");
 const stale=await put(0);
 if(stale.status!==409)fail();
 checks.push("optimistic-revision-conflict");
 const badCsrf=await put(1,"invalid-synthetic-csrf");
 if(badCsrf.status!==403)fail();
 checks.push("csrf-denial");
 const badCaller=await send("GET",path+"?id=synthetic-rehearsal",
  {"x-quotation-private-caller":"invalid-caller"});
 if(badCaller.status!==404)fail();
 checks.push("caller-denial");
 const denied=await send("POST","/api/quotation/issue",
  {origin:ORIGIN,"x-csrf-token":csrfToken,"content-type":"application/json"},{});
 if(denied.status!==404)fail();
 checks.push("issuance-disabled");
 return safeResult(checks);
}
