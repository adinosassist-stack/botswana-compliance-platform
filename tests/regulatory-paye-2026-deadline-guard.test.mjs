import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  PAYE_2026_COMMENCEMENT,
  PAYE_REMITTANCE_RULE_KEY,
  isPayeRemittanceRule,
  paye2026PromotionGuard
} from "../cloudflare/src/regulatory-paye-2026-deadline-guard.js";

const action=(days=15)=>({
  operationalization:"monthly_end_plus_days",
  dueDaysAfterPeriodEnd:days,
  obligation:{key:"paye-monthly-remittance",description:"PAYE employer remittance"}
});
const row=(input={})=>({
  rule_key:PAYE_REMITTANCE_RULE_KEY,
  effective_from:null,
  effective_to:null,
  summary:"Monthly payroll withholding remittance",
  action_json:JSON.stringify(action()),
  ...input
});

test("2026 cutoff is fixed and inactive historical rules remain distinguishable",()=>{
  assert.equal(PAYE_2026_COMMENCEMENT,"2026-07-01");
  for(const end of ["2026-06-30","2025-12-31","2026-02-28"]){
    const result=paye2026PromotionGuard(row({effective_from:"2024-01-01",effective_to:end}));
    assert.equal(result.ok,true,end);
    assert.equal(result.historicalOnly,true,end);
  }
  assert.equal(paye2026PromotionGuard(row({effective_to:"2026-07-01"})).ok,false);
  assert.equal(paye2026PromotionGuard(row({effective_to:"2026-06-31"})).ok,false);
  assert.equal(paye2026PromotionGuard(row({effective_to:"2026-06-30T00:00:00Z"})).ok,false);
  assert.equal(paye2026PromotionGuard(row({effective_to:" 2026-06-30"})).ok,false);
});

test("legacy 15-day rule cannot be approved for post-2026 periods",()=>{
  const versions=[
    row(),row({effective_from:"2026-07-01"}),row({effective_from:"2026-08-01"}),
    row({effective_from:"2026-07-01",effective_to:"2027-07-01"}),
    row({effective_from:"2026-06-30"}),
  ];
  for(const v of versions)assert.equal(paye2026PromotionGuard(v).ok,false);
  assert.equal(paye2026PromotionGuard(row({effective_from:"2026-07-01"})).error,"paye_2026_legacy_deadline_blocked");
});

test("current 2026 PAYE requires valid dates, number 14 and truthful explanatory copy",()=>{
  const base=row({effective_from:"2026-07-01",action_json:JSON.stringify(action(14))});
  assert.deepEqual(paye2026PromotionGuard(base),{ok:true});
  assert.deepEqual(paye2026PromotionGuard({...base,effective_from:"2026-09-01",effective_to:"2027-01-31"}),{ok:true});
  for(const bad of [
    {...base,effective_from:"2026-06-30"},
    {...base,effective_from:"2026-07-32"},
    {...base,effective_from:"2026-07-01Z"},
    {...base,effective_to:"2026-06-30"},
    {...base,effective_to:"invalid-date"},
  ])assert.equal(paye2026PromotionGuard(bad).ok,false);
  for(const badAction of [
    {...action(15)}, {...action("14")}, {...action(0)}, {...action(null)},
    {...action(14),operationalization:"monthly_salary_threshold"}
  ])assert.equal(paye2026PromotionGuard(base,badAction).ok,false);
  assert.equal(paye2026PromotionGuard({...base,summary:"15 days after the payment month"}).error,"paye_2026_legacy_deadline_copy_blocked");
  assert.equal(paye2026PromotionGuard(base,{...action(14),obligation:{key:"paye-monthly-remittance",description:"Fifteen days after month-end"}}).ok,false);
});

test("PAYE detection also catches renamed rule keys carrying the same obligation",()=>{
  assert.equal(isPayeRemittanceRule({rule_key:"completely.different"},action(15)),true);
  assert.equal(paye2026PromotionGuard(row({rule_key:"completely.different",effective_from:"2026-07-01"})).ok,false);
  assert.equal(paye2026PromotionGuard({rule_key:PAYE_REMITTANCE_RULE_KEY,effective_from:"2026-07-01",action_json:"not-json"}).ok,false);
  const unrelated={rule_key:"bw.cipa.company.annual-return.recurring",effective_from:null,action_json:JSON.stringify({operationalization:"annual_profile_date"})};
  assert.equal(isPayeRemittanceRule(unrelated),false);
  assert.deepEqual(paye2026PromotionGuard(unrelated),{ok:true});
});

test("production promotion path fail-closes before any approval or publish database write",()=>{
  const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  assert.match(worker,/import \{paye2026PromotionGuard\} from "\.\/regulatory-paye-2026-deadline-guard\.js";/);
  const guardAt=worker.indexOf("const payeGuard=paye2026PromotionGuard(row,actionDef)");
  const approval=worker.indexOf('if(next==="approved")',guardAt);
  const publish=worker.indexOf('if(next==="published")',guardAt);
  assert.ok(guardAt>0 && approval>guardAt && publish>approval);
  const block=worker.slice(guardAt,approval);
  assert.match(block,/return json\(payeGuard,409\)/);
  assert.match(block,/executableRuleIntegrityReady/);
});

test("runtime evaluation and recurring scheduling reject stale PAYE before DB access",async()=>{
  const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  const unsafe=row({id:"legacy-paye",status:"published",effective_from:null});
  const db={prepare(){throw new Error("unexpected database access for blocked PAYE")}};
  const cases=[
    ["async function evaluateRuleForTenant","\n\n\nfunction daysUntil"],
    ["async function materializeRecurringRule","async function runStatutoryDeadlineEngine"]
  ];
  for(const [startKey,endKey]of cases){
    const begin=worker.indexOf(startKey),end=worker.indexOf(endKey,begin);
    assert.ok(begin>0 && end>begin,"missing runtime boundary "+startKey);
    const runtime=vm.runInNewContext("("+worker.slice(begin,end).trim()+")",{
      isLegacyVat25DayDefinition:()=>false,paye2026PromotionGuard
    },{timeout:1000});
    const answer=startKey.includes("evaluateRule")
      ?await runtime({DB:db},unsafe,"test-tenant")
      :await runtime({DB:db},"test-tenant",unsafe,{},"test-run");
    assert.equal(answer.obligationsCreated??answer.created,0);
    assert.equal(answer.status==="blocked_paye_2026"||answer.blocked===true,true);
  }
});
