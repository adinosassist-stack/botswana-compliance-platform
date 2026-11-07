import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  candidateStoreCapability,createNamibiaEntityDraft,createNamibiaEvidenceMetadata,
  createNamibiaCalendarDraft,listNamibiaEvidenceMetadata,listNamibiaCalendarDrafts,listNamibiaAuditEvents
} from "../cloudflare/src/namibia-compliance-candidate-store.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";

const owner={tenant_id:"tenant-A",user_id:"owner-A",role:"owner",marketCode:"NA"};
const other={...owner,tenant_id:"tenant-B",user_id:"owner-B"};
const entity={entityRef:"NA-001",entityType:"company",financialYearEnd:"2026-12-31"};
const sourceUrl="https://www.bipa.na/annual-duty/";
function fakeDb(){
  const trace=[],rows={entities:new Set(),evidence:[],calendar:[],audit:[]};
  function statement(sql,params=[]){
    return {
      bind(...args){return statement(sql,args)},
      async first(){
        trace.push({sql,params,action:"first"});
        if(sql.includes("FROM na_compliance_entities"))return rows.entities.has(params.join("::"))?{entity_ref:params[1]}:null;
        throw Error("unexpected query");
      },
      async all(){
        trace.push({sql,params,action:"all"});
        const items=sql.includes("FROM na_compliance_evidence")?rows.evidence:
          sql.includes("FROM na_compliance_calendar_drafts")?rows.calendar:
          sql.includes("FROM na_compliance_audit_events")?rows.audit:null;
        if(!items)throw Error("unexpected query");
        return {results:items.filter(x=>x.tenant_id===params[0]&&x.entity_ref===params[1])};
      },
      execute(){
        trace.push({sql,params,action:"execute"});
        if(sql.startsWith("INSERT INTO na_compliance_entities")){
          const k=params[0]+"::"+params[1];if(rows.entities.has(k))throw Error("duplicate");
          rows.entities.add(k);
        }else if(sql.startsWith("INSERT INTO na_compliance_evidence")){
          rows.evidence.push({tenant_id:params[0],entity_ref:params[2],evidence_id:params[1]});
        }else if(sql.startsWith("INSERT INTO na_compliance_calendar_drafts")){
          rows.calendar.push({tenant_id:params[0],entity_ref:params[2],draft_id:params[1]});
        }else if(sql.startsWith("INSERT INTO na_compliance_audit_events")){
          rows.audit.push({tenant_id:params[0],entity_ref:params[2],event_type:params[4]});
        }else throw Error("unexpected write");
      }
    };
  }
  return {trace,rows,prepare:sql=>statement(sql),async batch(statements){
    const before={entities:new Set(rows.entities),evidence:[...rows.evidence],calendar:[...rows.calendar],audit:[...rows.audit]};
    try{for(const s of statements)s.execute()}catch(e){
      rows.entities=before.entities;rows.evidence=before.evidence;rows.calendar=before.calendar;rows.audit=before.audit;throw e;
    }
  }};
}
test("candidate schema and storage capability stay outside production",()=>{
  const schema=fs.readFileSync(new URL("../proposals/namibia/001_compliance_candidate.sql",import.meta.url),"utf8");
  const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  assert.equal(candidateStoreCapability().productionEnabled,false);
  assert.equal(candidateStoreCapability().attachedToWorker,false);
  assert.match(schema,/PRIMARY KEY \(tenant_id,\s*evidence_id\)/);
  assert.match(schema,/PRIMARY KEY \(tenant_id,\s*draft_id\)/);
  assert.match(schema,/FOREIGN KEY \(tenant_id,\s*entity_ref\)/);
  assert.match(schema,/notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK\(notification_enabled=0\)/);
  assert.match(schema,/filing_enabled INTEGER NOT NULL DEFAULT 0 CHECK\(filing_enabled=0\)/);
  assert.doesNotMatch(worker,/namibia-compliance-candidate-store/);
  assert.equal(marketActivationReadiness("NA").ready,false);
});
test("writes require explicit Namibia principal and owner/manager role",async()=>{
  const db=fakeDb();
  for(const auth of [null,{...owner,marketCode:"BW"},{...owner,role:"auditor"},{...owner,tenant_id:""}]){
    assert.equal((await createNamibiaEntityDraft(db,auth,entity)).ok,false);
  }
  assert.equal(db.trace.length,0);
});
test("entity, evidence metadata, calendar writes have matched tenant-keyed audit events",async()=>{
  const db=fakeDb();
  assert.equal((await createNamibiaEntityDraft(db,owner,entity)).ok,true);
  assert.equal((await createNamibiaEntityDraft(db,other,entity)).ok,true);
  assert.equal((await createNamibiaEvidenceMetadata(db,owner,{entityRef:"NA-001",evidenceType:"entity_registration",label:"Registration reference"})).ok,true);
  assert.equal((await createNamibiaCalendarDraft(db,owner,{entityRef:"NA-001",taskType:"bipa_annual_return",title:"Review annual filing",planningDate:"2027-01-10",sourceUrl})).ok,true);
  assert.equal(db.rows.audit.length,4);
  assert.equal((await listNamibiaEvidenceMetadata(db,owner,"NA-001")).value.length,1);
  assert.equal((await listNamibiaEvidenceMetadata(db,other,"NA-001")).value.length,0);
  assert.equal((await listNamibiaCalendarDrafts(db,other,"NA-001")).value.length,0);
  assert.equal((await listNamibiaAuditEvents(db,other,"NA-001")).value.length,1);
  for(const entry of db.trace.filter(x=>x.action==="first"||x.action==="all")){
    assert.match(entry.sql,/tenant_id=\?/);
    assert.equal(typeof entry.params[0],"string");
  }
});
test("missing tenant entity and unsafe metadata are refused",async()=>{
  const db=fakeDb();
  assert.equal((await createNamibiaEvidenceMetadata(db,owner,{entityRef:"unknown",evidenceType:"entity_registration",label:"A"})).error,"entity_not_found");
  await createNamibiaEntityDraft(db,owner,entity);
  const input={entityRef:"NA-001",evidenceType:"entity_registration",label:"A"};
  assert.equal((await createNamibiaEvidenceMetadata(db,owner,{...input,file:"secret"})).ok,false);
  assert.equal((await createNamibiaEvidenceMetadata(db,owner,{...input,sourceUrl:"http://not-secure.example"})).ok,false);
  assert.equal((await createNamibiaEvidenceMetadata(db,owner,{...input,evidenceType:"passport"})).ok,false);
  assert.equal((await createNamibiaCalendarDraft(db,owner,{entityRef:"NA-001",taskType:"bipa_annual_return",title:"T",planningDate:"2026-02-30",sourceUrl})).ok,false);
  assert.equal((await createNamibiaCalendarDraft(db,owner,{entityRef:"NA-001",taskType:"bipa_annual_return",title:"T",planningDate:"2027-02-01",sourceUrl,notify:true})).error,"activation_not_authorized");
  assert.equal((await createNamibiaCalendarDraft(db,owner,{entityRef:"NA-001",taskType:"bipa_annual_return",title:"T",planningDate:"2027-02-01",sourceUrl,submit:true})).error,"activation_not_authorized");
  assert.equal(db.rows.evidence.length,0);
  assert.equal(db.rows.calendar.length,0);
  assert.equal(db.rows.audit.length,1);
});
