import assert from "node:assert/strict";
import worker from "../cloudflare/src/worker.js";

const secret="review-isolation-secret-20261011-abcdefghijklmnopqrstuvwxyz";
const auditSecret="review-audit-integrity-secret-20261011-abcdefghijklmnopqrstuvwxyz";
const origin="https://app.example";
const markers={
  "tenant-a":"ALPHA_PRIVATE_7f21",
  "tenant-b":"BRAVO_PRIVATE_9c44"
};
const otherTenant=tenant=>tenant==="tenant-a"?"tenant-b":"tenant-a";

async function hmacHex(secretValue,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secretValue),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

const sessions=new Map();
async function addSession(raw,tenant,role){
  sessions.set(await hmacHex(secret,raw),{
    user_id:`user-${tenant}-${role}`,tenant_id:tenant,role,session_role:role,session_public_id:`session-${tenant}-${role}`,
    csrf_token:`csrf-${tenant}-${role}`,created_at:"2026-10-11T00:00:00Z",last_seen_at:new Date().toISOString(),expires_at:"2026-12-01T00:00:00Z",
    email:`${tenant}-${role}@example.test`,display_name:`${tenant} ${role}`,onboarding_complete:1,tenant_name:tenant
  });
}
await addSession("owner-a","tenant-a","owner");
await addSession("owner-b","tenant-b","owner");
await addSession("reviewer-a","tenant-a","reviewer");
await addSession("reviewer-b","tenant-b","reviewer");

class Statement{
  constructor(db,sql,bindings=[]){this.db=db;this.sql=String(sql);this.bindings=bindings}
  bind(...bindings){return new Statement(this.db,this.sql,bindings)}
  async first(){return this.db.first(this.sql,this.bindings)}
  async all(){return {results:this.db.all(this.sql,this.bindings)}}
  async run(){this.db.runs.push({sql:this.sql,bindings:this.bindings});return {success:true,meta:{changes:1}}}
}
class IsolationDB{
  constructor(){this.runs=[]}
  prepare(sql){return new Statement(this,sql)}
  async batch(statements){
    const results=[];
    for(const statement of statements)results.push(await statement.run());
    return results;
  }
  tenantFrom(bindings){return bindings.find(v=>v==="tenant-a"||v==="tenant-b")||null}
  first(sql,bindings){
    if(sql.includes("FROM sessions s JOIN users u"))return sessions.get(String(bindings[0]))||null;
    const tenant=this.tenantFrom(bindings);
    if(sql.includes("FROM subscriptions WHERE tenant_id=?"))return {plan:"control",status:"active"};
    if(sql.includes("FROM entitlement_overrides WHERE tenant_id=?"))return {enabled:1,limit_value:null,expires_at:null};
    if(sql.includes("SELECT count FROM auth_rate_limits"))return {count:1};
    if(sql.includes("FROM audit_chain_state WHERE tenant_id=?"))return null;
    if(sql.includes("FROM ai_cost_controls WHERE tenant_id=?"))return null;
    if(sql.includes("FROM ai_credit_ledger WHERE tenant_id=?")&&sql.includes("entry_type='usage'"))return {used:0};
    if(sql.includes("FROM ai_provider_costs WHERE tenant_id=?"))return {cost:0};
    if(sql.includes("FROM ai_credit_wallets WHERE tenant_id=?"))return {balance:100,monthly_allowance:100,monthly_reset_at:"2026-11-01T00:00:00Z",lifetime_purchased:0,lifetime_used:0};
    if(sql.includes("UPDATE ai_credit_wallets")&&sql.includes("balance=balance-?")&&sql.includes("RETURNING balance"))return {balance:94};
    if(sql.trimStart().startsWith("SELECT 1 x FROM payment_refund_requests rr")&&sql.includes("po.tenant_id=?"))return null;
    if(sql.includes("FROM app_state WHERE tenant_id=?")){
      const marker=markers[tenant];
      return {version:1,state_json:JSON.stringify({activeCompanyId:`company-${tenant}`,companies:[{id:`company-${tenant}`,profile:{name:`Company ${marker}`,industry:`Services ${marker}`,employees:2,town:"Gaborone"}}]})};
    }
    if(sql.includes("FROM compliance_scores")&&tenant)return {score:88,grade:"A",dimensions_json:"{}",created_at:"2026-10-11T00:00:00Z"};
    if(sql.includes("FROM daily_operations_summaries")&&sql.includes("LIMIT 1"))return null;
    if(sql.includes("FROM evidence WHERE id=? AND tenant_id=?")){
      const [evidenceId,evidenceTenant]=bindings;
      const ownId=`evidence-${evidenceTenant}`;
      if(evidenceId!==ownId)return null;
      return {id:ownId,display_name:`Evidence ${markers[evidenceTenant]}`,content_type:"application/pdf",object_key:`tenant/${evidenceTenant}/${ownId}.pdf`,clean_object_key:null,review_status:"pending",scan_status:"not_scanned",scanned_at:null,malware_name:null,content_sha256:null};
    }
    return null;
  }
  all(sql,bindings){
    const tenant=this.tenantFrom(bindings);
    if(sql.includes("FROM employees e LEFT JOIN employee_risk_controls")){
      return [{id:`employee-${tenant}`,full_name:`Employee ${markers[tenant]}`,role_title:"Analyst",employment_type:"permanent",start_date:"2026-01-01",end_date:null,status:"active",contract_signed:1,asset_acknowledgement:1}];
    }
    if(sql.includes("FROM evidence WHERE tenant_id=?")&&sql.includes("content_sha256")){
      return [{id:`evidence-${tenant}`,name:`Evidence ${markers[tenant]}`,category:"Licence",mime_type:"application/pdf",size_bytes:100,status:"complete",review_status:"pending",scan_status:"clean",scan_attempts:1,scan_last_error:null,scanned_at:"2026-10-11T00:00:00Z",scanner_provider:"test",malware_name:null,content_sha256:`sha-${tenant}`,duplicate_of_evidence_id:null,valid_until:null,created_at:"2026-10-11T00:00:00Z",reviewed_at:null}];
    }
    if(sql.includes("FROM daily_operations_summaries WHERE tenant_id=?")){
      return [{id:`summary-${tenant}`,summary_date:"2026-10-11",location_id:null,report_count:1,expected_count:1,generation_mode:"deterministic",trigger_type:"manual",model:null,metrics_json:JSON.stringify({coverage:100,marker:markers[tenant]}),narrative_json:JSON.stringify({executiveSummary:`Operations ${markers[tenant]}`}),source_report_ids_json:JSON.stringify([`report-${tenant}`]),created_at:"2026-10-11T00:00:00Z"}];
    }
    if(sql.includes("FROM compliance_obligations o JOIN regulatory_rules r")&&tenant){
      return [{title:`Renew licence ${markers[tenant]}`,status:"open",priority:1,due_at:"2026-10-20T00:00:00Z",rule_key:`rule-${tenant}`,source_ids_json:"[]"}];
    }
    return [];
  }
}

const db=new IsolationDB();
const fakeAI={
  async run(_model,{prompt}){
    const present=Object.entries(markers).filter(([,marker])=>String(prompt).includes(marker));
    assert.equal(present.length,1,`grounded AI prompt must contain exactly one tenant marker, got ${present.map(([tenant])=>tenant).join(",")||"none"}`);
    const [tenant,marker]=present[0];
    assert.doesNotMatch(String(prompt),new RegExp(markers[otherTenant(tenant)]),"grounded AI prompt must not contain the other tenant marker");
    return {response:JSON.stringify({answer:`Grounded answer for ${marker}`,confidence:"high",actions:[],caveats:[],sourceRefs:[]})};
  }
};
const env={DB:db,AI:fakeAI,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:auditSecret,PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,ASSETS:{fetch:async()=>new Response("asset")},EVIDENCE:{get:async()=>null}};
const ctx={waitUntil(){}};
async function api(raw,path,{method="GET",csrf=null,body=null}={}){
  const headers={cookie:`bw_session=${raw}`,origin};
  if(body!==null)headers["content-type"]="application/json";
  if(csrf)headers["x-csrf-token"]=csrf;
  const response=await worker.fetch(new Request(origin+path,{method,headers,body:body===null?undefined:JSON.stringify(body)}),env,ctx);
  const data=await response.json().catch(()=>({}));
  return {response,data,text:JSON.stringify(data)};
}
function assertTenantOnly(text,tenant,label){
  assert.match(text,new RegExp(markers[tenant]),`${label} must contain the active tenant marker`);
  assert.doesNotMatch(text,new RegExp(markers[otherTenant(tenant)]),`${label} must not leak the other tenant marker`);
}

for(const [tenant,raw] of [["tenant-a","owner-a"],["tenant-b","owner-b"]]){
  const employees=await api(raw,"/api/employees");
  assert.equal(employees.response.status,200,"employee list must be available to the tenant owner");
  assertTenantOnly(employees.text,tenant,"employee list");

  const evidence=await api(raw,"/api/evidence/integrity");
  assert.equal(evidence.response.status,200,"evidence integrity list must be available to the tenant owner");
  assertTenantOnly(evidence.text,tenant,"evidence integrity list");

  const foreignEvidenceId=`evidence-${otherTenant(tenant)}`;
  const foreignDownload=await api(raw,`/api/evidence/${foreignEvidenceId}/download`);
  assert.equal(foreignDownload.response.status,404,"foreign evidence identifiers must resolve as not found");
  assert.equal(foreignDownload.data.error,"not_found");
  assert.doesNotMatch(foreignDownload.text,new RegExp(markers[otherTenant(tenant)]),"foreign evidence errors must not disclose foreign metadata");

  const reports=await api(raw,"/api/daily-reporting/summaries?date=2026-10-11");
  assert.equal(reports.response.status,200,"daily reporting summaries must be available to the tenant owner");
  assertTenantOnly(reports.text,tenant,"daily reporting summaries");
}

for(const [tenant,raw] of [["tenant-a","reviewer-a"],["tenant-b","reviewer-b"]]){
  const ai=await api(raw,"/api/ai/advisor",{method:"POST",csrf:`csrf-${tenant}-reviewer`,body:{mode:"ask",question:"What compliance work should I prioritise next?"}});
  assert.equal(ai.response.status,200,`AI advisor must complete grounded generation for ${tenant}: ${ai.text}`);
  assert.equal(ai.data.generationMode,"workers_ai");
  assertTenantOnly(ai.text,tenant,"AI advisor response");
}

const sensitiveSql=db.runs.filter(x=>/evidence|ai_advisor_runs|audit|ai_credit/i.test(x.sql));
assert.ok(sensitiveSql.length>0,"qualification must exercise evidence/AI persistence, credit or audit paths");
console.log("V326 cross-tenant runtime isolation: employee, evidence, reporting and grounded AI boundaries PASS");
