import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import fs from "node:fs";
import vm from "node:vm";
import {isActiveLegacyVatRule,isLegacyVat25DayDefinition,inspectActiveLegacyVatRules} from "../cloudflare/src/regulatory-foundation-legacy-vat.js";

test("legacy VAT 25-day detection handles rule keys, action definitions and cutoff dates",()=>{
  const base={id:"x",rule_key:"bw.burs.vat.return-payment.25-days",status:"published",effective_to:null,action_json:"{}"};
  assert.equal(isActiveLegacyVatRule(base),true);
  assert.equal(isActiveLegacyVatRule({...base,status:"approved"}),true);
  assert.equal(isActiveLegacyVatRule({...base,status:"review"}),false);
  assert.equal(isActiveLegacyVatRule({...base,status:"draft"}),false);
  assert.equal(isActiveLegacyVatRule({...base,effective_to:"2026-06-30"}),false);
  assert.equal(isActiveLegacyVatRule({...base,effective_to:"2026-07-01"}),true);
  assert.equal(isActiveLegacyVatRule({...base,effective_to:"not-a-date"}),true);
  assert.equal(isActiveLegacyVatRule({...base,effective_to:"2026-06-31"}),true);
  assert.equal(isActiveLegacyVatRule({...base,rule_key:"other",action_json:JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:25})}),true);
  assert.equal(isActiveLegacyVatRule({...base,rule_key:"other",action_json:JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:28})}),false);
  assert.equal(isActiveLegacyVatRule({...base,rule_key:"bw.burs.vat.return-payment.28-days",action_json:"{}"}),false);
  assert.equal(isActiveLegacyVatRule({...base,action_json:"invalid-json"}),true);
});

test("read-only DB query surfaces active legacy rules without mutation",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  try{
    sqlite.exec("CREATE TABLE regulatory_rules(id TEXT,rule_key TEXT,status TEXT,effective_to TEXT,action_json TEXT,version INTEGER)");
    const stmt=sqlite.prepare("INSERT INTO regulatory_rules VALUES(?,?,?,?,?,?)");
    stmt.run("one","bw.burs.vat.return-payment.25-days","approved",null,"{}",1);
    stmt.run("two","bw.burs.vat.return-payment.25-days","published","2026-06-30","{}",2);
    stmt.run("three","bw.burs.vat.return-payment.28-days","draft",null,"{}",1);
    const db={prepare:sql=>({all:async()=>({results:sqlite.prepare(sql).all()}),bind:(...args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)})})})};
    const before=sqlite.prepare("SELECT total_changes() count").get().count;
    const result=await inspectActiveLegacyVatRules(db);
    assert.equal(result.ok,false);
    assert.equal(result.count,1);
    assert.equal(result.rules[0].ruleId,"one");
    assert.equal(sqlite.prepare("SELECT total_changes() count").get().count,before);
  }finally{sqlite.close()}
});

test("runtime execution hard-blocks legacy VAT before creating customer obligations",async()=>{
  const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  const legacy={id:"legacy",rule_key:"bw.burs.vat.return-payment.25-days",
    status:"published",action_json:'{"operationalization":"vat_category_period","dueDaysAfterPeriodEnd":25}',effective_to:null};
  assert.equal(isLegacyVat25DayDefinition(legacy),true);
  const db={prepare(){throw new Error("unexpected database mutation")}};
  const examples=[
    ["async function evaluateRuleForTenant","\n\n\nfunction daysUntil"],
    ["async function materializeRecurringRule","async function runStatutoryDeadlineEngine"]
  ];
  for(const [startKey,endKey] of examples){
    const start=worker.indexOf(startKey),end=worker.indexOf(endKey,start);
    assert.ok(start>0&&end>start,`missing runtime function ${startKey}`);
    const fn=vm.runInNewContext("("+worker.slice(start,end).trim()+")",
      {isLegacyVat25DayDefinition},{timeout:1200});
    const answer=startKey.includes("evaluateRule")
      ?await fn({DB:db},legacy,"tenant")
      :await fn({DB:db},"tenant",legacy,{},"run");
    assert.equal(answer.obligationsCreated??answer.created,0);
    assert.equal(answer.status==="blocked_legacy_vat"||answer.blocked===true,true);
  }
});
