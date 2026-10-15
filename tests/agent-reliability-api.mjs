import assert from "node:assert/strict";
import {handleReliabilityAdvisorRequest} from "../cloudflare/src/agent-reliability-api.js";
const request=(url="https://thebe.example/api/ai/operator/reliability",method="GET")=>new Request(url,{method});
const read=async(response)=>({status:response.status,body:await response.json()});
const disabled={THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"false"};
assert.equal((await read(await handleReliabilityAdvisorRequest(request(),{env:disabled}))).status,401);
assert.equal((await read(await handleReliabilityAdvisorRequest(request(),{auth:{tenant_id:"tenant-A",role:"manager"},env:{THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}}))).status,403);
assert.equal((await read(await handleReliabilityAdvisorRequest(request(),{auth:{tenant_id:"tenant-A",role:"owner"},env:disabled}))).status,404);
assert.equal((await read(await handleReliabilityAdvisorRequest(request("https://thebe.example/api/ai/operator/reliability?days=91"),{auth:{tenant_id:"tenant-A",role:"owner"},env:{THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}}))).status,400);
assert.equal((await read(await handleReliabilityAdvisorRequest(request("https://thebe.example/api/ai/operator/reliability","POST"),{auth:{tenant_id:"tenant-A",role:"owner"},env:{THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}}))).status,404);
let queriedTenant=null;
const db={prepare(sql){assert.match(sql,/tenant_id=\?/);return {bind(tenant){queriedTenant=tenant;return {async all(){return {results:[]}}}}}}};
const response=await read(await handleReliabilityAdvisorRequest(request("https://thebe.example/api/ai/operator/reliability?days=7&tenantId=tenant-B"),{auth:{tenant_id:"tenant-A",role:"owner"},env:{DB:db,THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}}));
assert.equal(response.status,200);
assert.equal(queriedTenant,"tenant-A");
assert.equal(response.body.mode,"advisor_only");
assert.equal(response.body.canMutate,false);
assert.equal(response.body.summary?.tenantId==="tenant-B",false,"cross-tenant summary must not be returned");
for(const forgedRole of ["admin","manager","auditor","reviewer","OWNER-ADMIN","Owner","OWNER"]){
  const attempt=await read(await handleReliabilityAdvisorRequest(request("https://thebe.example/api/ai/operator/reliability?role=owner&tenantId=tenant-B"),{
    auth:{tenant_id:"tenant-A",role:forgedRole},env:{DB:db,THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}
  }));
  assert.equal(attempt.status,403,`role ${forgedRole} must not access owner-only advisor`);
}
const invalidWindow=await read(await handleReliabilityAdvisorRequest(request("https://thebe.example/api/ai/operator/reliability?days=0"),{
  auth:{tenant_id:"tenant-A",role:"owner"},env:{DB:db,THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}
}));
assert.equal(invalidWindow.status,400);
for(const tenant of ["../other","tenant with spaces",""]){
  const attempt=await read(await handleReliabilityAdvisorRequest(request(),{
    auth:{tenant_id:tenant,role:"owner"},env:{DB:db,THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"}
  }));
  assert.equal(attempt.status,401,"invalid authenticated tenant must be rejected");
}


console.log("reliability API authorization tests passed");
