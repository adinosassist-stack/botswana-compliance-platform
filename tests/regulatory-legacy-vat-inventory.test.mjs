import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

test("aggregate legacy VAT D1 inventory is read-only, de-identified and separates current from corrected rules",()=>{
  const sql=fs.readFileSync(new URL("../cloudflare/queries/regulatory-legacy-vat-obligations-readonly.sql",import.meta.url),"utf8");
  assert.match(sql,/^\s*--[\s\S]*?WITH defined AS/i);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\s+(?:INTO|FROM|TABLE|regulatory_|compliance_)/i);
  assert.doesNotMatch(sql,/\b(?:tenant_id|email|actor_user_id|obligation_key|title|description)\s+AS\s+/i);
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
    db.prepare("INSERT INTO tenants(id,name) VALUES('t1','Private customer one'),('t2','Private customer two')").run();
    const makeRule=db.prepare(`INSERT INTO regulatory_rules
      (id,rule_key,version,title,summary,applicability_json,action_json,source_ids_json,status,confidence)
      VALUES(?,?,1,'VAT test','Fixture only','{}',?,'[]',?,'medium')`);
    makeRule.run("old","bw.burs.vat.return-payment.25-days",JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:25}),"published");
    makeRule.run("new","bw.burs.vat.return-payment.28-days",JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:28}),"draft");
    makeRule.run("alternate","bw.legacy.alternate-vat",JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:25}),"approved");
    const ob=db.prepare(`INSERT INTO compliance_obligations
      (id,tenant_id,rule_id,obligation_key,title,status,due_at)
      VALUES(?,?,?,?,?,?,?)`);
    ob.run("o1","t1","old","k1","Private source VAT","open","2026-09-25");
    ob.run("o2","t1","old","k2","Private source VAT","completed","2026-07-25");
    ob.run("o3","t2","old","k3","Private source VAT","review","2026-08-25");
    ob.run("o4","t2","new","k4","New rule VAT","open","2026-09-28");
    db.prepare(`INSERT INTO statutory_schedule_status
      (tenant_id,rule_id,schedule_type,config_status)
      VALUES('t1','old','vat_category_period','ready'),('t2','old','vat_category_period','needs_input')`).run();
    const before=db.prepare("SELECT total_changes() n").get().n;
    db.exec("PRAGMA query_only=ON");
    const result=db.prepare(sql).all();
    assert.equal(result.length,2,"legacy key and alternate 25-day action are both inventoried");
    const old=result.find(x=>x.rule_key==="bw.burs.vat.return-payment.25-days");
    const alt=result.find(x=>x.rule_key==="bw.legacy.alternate-vat");
    assert.ok(old&&alt);
    assert.equal(old.rule_status,"published");
    assert.equal(old.total_obligations,3);
    assert.equal(old.affected_tenants,2);
    assert.equal(old.open_obligations,1);
    assert.equal(old.completed_obligations,1);
    assert.equal(old.review_obligations,1);
    assert.equal(old.schedules,2);
    assert.equal(old.ready_schedules,1);
    assert.equal(old.needs_input_schedules,1);
    assert.equal(old.earliest_due_at,"2026-07-25");
    assert.equal(alt.total_obligations,0);
    assert.ok(result.every(row=>!("tenant_id" in row)&&!("title" in row)&&!("obligation_key" in row)));
    assert.equal(db.prepare("SELECT total_changes() n").get().n,before);
  }finally{db.close()}
});
