import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {
  createNamibiaEntityDraft,createNamibiaEvidenceMetadata,createNamibiaCalendarDraft,
  listNamibiaEvidenceMetadata,listNamibiaCalendarDrafts,listNamibiaAuditEvents
} from "../cloudflare/src/namibia-compliance-candidate-store.js";

const schema=readFileSync(new URL("../proposals/namibia/001_compliance_candidate.sql",import.meta.url),"utf8");
const tenantA={tenant_id:"na-tenant-A",user_id:"owner-A",role:"owner",marketCode:"NA"};
const tenantB={tenant_id:"na-tenant-B",user_id:"owner-B",role:"owner",marketCode:"NA"};
const entity={entityRef:"NA-SAMPLE",entityType:"company",financialYearEnd:"2026-12-31"};
const bipa="https://www.bipa.na/annual-duty/";

function disposableD1({rejectAudits=false}={}){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(schema);
  const failAudit="CREATE TRIGGER test_reject_audits BEFORE INSERT ON na_compliance_audit_events BEGIN SELECT RAISE(ABORT,'injected_audit_failure'); END;";
  if(rejectAudits)sqlite.exec(failAudit);
  const wrapper=sql=>({
    bind(...params){
      const stmt=sqlite.prepare(sql);
      const normalized=params.map(p=>p===undefined?null:p);
      return {
        async first(){return stmt.get(...normalized)||null},
        async all(){return {results:stmt.all(...normalized)}},
        run(){return stmt.run(...normalized)}
      };
    }
  });
  return {
    sqlite,failAudit,prepare:wrapper,
    async batch(statements){
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const results=statements.map(stmt=>stmt.run());
        sqlite.exec("COMMIT");return results;
      }catch(error){sqlite.exec("ROLLBACK");throw error}
    }
  };
}
function count(db,table,tenant){
  const allowed=new Set(["na_compliance_entities","na_compliance_evidence","na_compliance_calendar_drafts","na_compliance_audit_events"]);
  assert.ok(allowed.has(table));
  return db.sqlite.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE tenant_id=?").get(tenant).n;
}
test("disposable SQLite rehearsal: schema, references, tenant isolation and audit writes",async()=>{
  const db=disposableD1();
  try{
    assert.equal((await createNamibiaEntityDraft(db,tenantA,entity)).ok,true);
    assert.equal((await createNamibiaEntityDraft(db,tenantB,entity)).ok,true);
    assert.equal((await createNamibiaEvidenceMetadata(db,tenantA,{entityRef:"NA-SAMPLE",evidenceType:"entity_registration",label:"Registration reference"})).ok,true);
    assert.equal((await createNamibiaCalendarDraft(db,tenantA,{
      entityRef:"NA-SAMPLE",taskType:"bipa_annual_return",title:"Plan BIPA review",planningDate:"2027-01-15",sourceUrl:bipa
    })).ok,true);
    assert.equal((await listNamibiaEvidenceMetadata(db,tenantA,"NA-SAMPLE")).value.length,1);
    assert.equal((await listNamibiaEvidenceMetadata(db,tenantB,"NA-SAMPLE")).value.length,0);
    assert.equal((await listNamibiaCalendarDrafts(db,tenantA,"NA-SAMPLE")).value.length,1);
    assert.equal((await listNamibiaCalendarDrafts(db,tenantB,"NA-SAMPLE")).value.length,0);
    assert.equal((await listNamibiaAuditEvents(db,tenantA,"NA-SAMPLE")).value.length,3);
    assert.equal((await listNamibiaAuditEvents(db,tenantB,"NA-SAMPLE")).value.length,1);
    const fields=db.sqlite.prepare("SELECT verified,status FROM na_compliance_evidence WHERE tenant_id=?").get(tenantA.tenant_id);
    assert.equal(fields.verified,0);assert.equal(fields.status,"metadata_only");
    const row=db.sqlite.prepare("SELECT official_deadline_confirmed,notification_enabled,filing_enabled FROM na_compliance_calendar_drafts WHERE tenant_id=?").get(tenantA.tenant_id);
    assert.equal(row.official_deadline_confirmed,0);assert.equal(row.notification_enabled,0);assert.equal(row.filing_enabled,0);
    assert.throws(()=>db.sqlite.prepare("UPDATE na_compliance_calendar_drafts SET filing_enabled=1 WHERE tenant_id=?").run(tenantA.tenant_id),/CHECK constraint/i);
  }finally{db.sqlite.close()}
});
test("failed audit insert rolls back entity, evidence and calendar writes",async()=>{
  const db=disposableD1({rejectAudits:true});
  try{
    assert.equal((await createNamibiaEntityDraft(db,tenantA,entity)).ok,false);
    assert.equal(count(db,"na_compliance_entities",tenantA.tenant_id),0);
    db.sqlite.exec("DROP TRIGGER test_reject_audits");
    assert.equal((await createNamibiaEntityDraft(db,tenantA,entity)).ok,true);
    db.sqlite.exec(db.failAudit);
    assert.equal((await createNamibiaEvidenceMetadata(db,tenantA,{
      entityRef:"NA-SAMPLE",evidenceType:"entity_registration",label:"Test evidence"
    })).ok,false);
    assert.equal((await createNamibiaCalendarDraft(db,tenantA,{
      entityRef:"NA-SAMPLE",taskType:"bipa_annual_return",title:"Test calendar",planningDate:"2027-01-15",sourceUrl:bipa
    })).ok,false);
    assert.equal(count(db,"na_compliance_evidence",tenantA.tenant_id),0);
    assert.equal(count(db,"na_compliance_calendar_drafts",tenantA.tenant_id),0);
    assert.equal(count(db,"na_compliance_audit_events",tenantA.tenant_id),1);
  }finally{db.sqlite.close()}
});
test("composite foreign keys reject cross-tenant evidence even with shared references",()=>{
  const db=disposableD1();
  try{
    db.sqlite.prepare("INSERT INTO na_compliance_entities(tenant_id,entity_ref,entity_type,financial_year_end) VALUES(?,?,?,?)")
      .run("tenant-A","A-only-entity","company","2026-12-31");
    assert.throws(()=>db.sqlite.prepare("INSERT INTO na_compliance_evidence(tenant_id,evidence_id,entity_ref,evidence_type,label,created_by) VALUES(?,?,?,?,?,?)")
      .run("tenant-B","cross","A-only-entity","entity_registration","Cross","owner-B"),/FOREIGN KEY/i);
    assert.equal(count(db,"na_compliance_evidence","tenant-B"),0);
  }finally{db.sqlite.close()}
});
