import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {appendNamibiaResearchNote} from "../cloudflare/src/namibia-research-note-intake.js";
import {draftNamibiaRuleRevision} from "../cloudflare/src/namibia-rule-review-ledger.js";
const hash="a".repeat(64);
const source={sourceId:"na_bipa_annual_duty",authority:"bipa",title:"BIPA official source candidate",
 url:"https://www.bipa.na/annual-duty/",capturedAt:"2026-11-07",contentSha256:hash};
const draft=draftNamibiaRuleRevision({source,ruleKey:"na_bipa_annual_return",revision:1,taskType:"bipa_annual_return",title:"Annual return evidence",reviewQuestion:"Check statutory deadline before release"}).value;
const rule={...draft,sourceRevision:1};
const reviewer={marketCode:"NA",role:"reviewer",authenticatedBy:"server_session",user_id:"synthetic-reviewer-1"};
const note={finding:"requires_legal_opinion",rationale:"Review latest primary legal source and effective date."};
function db(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON");
 sqlite.exec(readFileSync(new URL("../proposals/namibia/002_source_evidence_candidate.sql",import.meta.url),"utf8"));
 sqlite.prepare("INSERT INTO na_source_versions(source_id,revision,authority,source_url,captured_at,content_sha256,byte_length) VALUES(?,?,?,?,?,?,?)")
   .run(source.sourceId,1,"bipa",source.url,source.capturedAt,hash,123);
 return {sqlite,prepare:sql=>({bind(...args){const stmt=sqlite.prepare(sql);return {async run(){return stmt.run(...args)}}}})};
}
test("server-derived researcher identity is recorded against exact immutable source hash",async()=>{
 const d=db();try{
  const r=await appendNamibiaResearchNote(d,reviewer,rule,note);
  assert.equal(r.ok,true);
  assert.equal(r.value.approvalGranted,false);
  const rows=d.sqlite.prepare("SELECT reviewer_ref,source_sha256,approval_granted FROM na_source_review_notes").all();
  assert.deepEqual(rows.map(row=>({...row})),[{reviewer_ref:reviewer.user_id,source_sha256:hash,approval_granted:0}]);
 }finally{d.sqlite.close()}
});
test("rejects requester reviewer spoof, unauthorized roles and wrong source hash",async()=>{
 const d=db();try{
  for(const actor of [null,{...reviewer,role:"owner"},{...reviewer,authenticatedBy:"body"},{...reviewer,user_id:""}]){
    assert.equal((await appendNamibiaResearchNote(d,actor,rule,note)).ok,false);
  }
  assert.equal((await appendNamibiaResearchNote(d,reviewer,rule,{...note,reviewerId:"someone-else"})).error,"client_reviewer_override_forbidden");
  assert.equal((await appendNamibiaResearchNote(d,reviewer,rule,{...note,approved:true})).ok,false);
  assert.equal((await appendNamibiaResearchNote(d,reviewer,{...rule,sourceHash:"b".repeat(64)},note)).error,"review_note_write_failed");
  assert.equal((await appendNamibiaResearchNote(d,reviewer,{...rule,sourceRevision:2},note)).error,"review_note_write_failed");
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) AS n FROM na_source_review_notes").get().n,0);
 }finally{d.sqlite.close()}
});
test("candidate intake is absent from deployed worker and cannot approve regulations",()=>{
 const worker=readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
 assert.doesNotMatch(worker,/namibia-research-note-intake/);
 assert.equal(draft.legalApproved,false);
});
