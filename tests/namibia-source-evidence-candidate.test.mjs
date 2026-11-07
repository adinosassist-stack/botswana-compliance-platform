import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {
 sha256NamibiaSource,createNamibiaSourceEvidenceCandidate,
 checkNamibiaSourceEvidenceLedger,crossCheckNamibiaRuleSource
} from "../cloudflare/src/namibia-source-evidence-candidate.js";
import {draftNamibiaRuleRevision} from "../cloudflare/src/namibia-rule-review-ledger.js";
import {regulatoryPackBundleForMarket} from "../cloudflare/src/regulatory-pack-registry.js";

const bytes=new TextEncoder().encode("synthetic BIPA research document. Not legal guidance.");
const metadata={sourceId:"na_bipa_annual_duty",authority:"bipa",title:"BIPA annual duty research snapshot",
 url:"https://www.bipa.na/annual-duty/",capturedAt:"2026-11-07"};
test("matching source bytes create a nonapproved immutable evidence candidate",async()=>{
 const digest=await sha256NamibiaSource(bytes);assert.equal(digest.ok,true);
 const source=await createNamibiaSourceEvidenceCandidate({metadata:{...metadata,contentSha256:digest.sha256},bytes,revision:1});
 assert.equal(source.ok,true);assert.equal(source.value.storeBytes,false);
 assert.equal(source.value.legalApproved,false);assert.equal(source.value.releaseEnabled,false);
 assert.equal(checkNamibiaSourceEvidenceLedger([source.value]).activationReady,false);
 assert.equal(checkNamibiaSourceEvidenceLedger([source.value,source.value]).error,"duplicate_source_revision");
 assert.equal(regulatoryPackBundleForMarket("NA"),null);
 const rule=draftNamibiaRuleRevision({ruleKey:"na_bipa_annual_return",revision:1,
 taskType:"bipa_annual_return",title:"Annual duty research",
 reviewQuestion:"Check source against verified effective date before using",
 source:{...metadata,contentSha256:digest.sha256}});
 assert.equal(rule.ok,true);
 assert.equal(crossCheckNamibiaRuleSource(rule.value,source.value).hashMatched,true);
 assert.equal(crossCheckNamibiaRuleSource({...rule.value,sourceHash:"b".repeat(64)},source.value).ok,false);
});
test("mismatched hash, empty bytes and oversized source fail closed",async()=>{
 const digest=await sha256NamibiaSource(bytes);
 assert.equal((await createNamibiaSourceEvidenceCandidate({metadata:{...metadata,contentSha256:"0".repeat(64)},bytes,revision:1})).error,"content_hash_mismatch");
 assert.equal((await createNamibiaSourceEvidenceCandidate({metadata:{...metadata,contentSha256:digest.sha256},bytes:new Uint8Array(),revision:1})).ok,false);
 assert.equal((await sha256NamibiaSource(new Uint8Array(2_000_001))).ok,false);
 assert.equal((await createNamibiaSourceEvidenceCandidate({metadata:{...metadata,contentSha256:digest.sha256},bytes,revision:0})).ok,false);
});
test("disposable SQLite source provenance tables enforce append-only and no approval",()=>{
 const db=new DatabaseSync(":memory:");
 try{
   db.exec("PRAGMA foreign_keys=ON");
   db.exec(readFileSync(new URL("../proposals/namibia/002_source_evidence_candidate.sql",import.meta.url),"utf8"));
   const hash="a".repeat(64);
   db.prepare("INSERT INTO na_source_versions(source_id,revision,authority,source_url,captured_at,content_sha256,byte_length) VALUES(?,?,?,?,?,?,?)")
     .run("na_bipa_annual_duty",1,"bipa",metadata.url,"2026-11-07",hash,bytes.length);
   assert.throws(()=>db.prepare("UPDATE na_source_versions SET authority='fic' WHERE source_id='na_bipa_annual_duty'").run(),/namibia_source_append_only/);
   assert.throws(()=>db.prepare("DELETE FROM na_source_versions WHERE source_id='na_bipa_annual_duty'").run(),/namibia_source_append_only/);
   assert.throws(()=>db.prepare("INSERT INTO na_source_versions(source_id,revision,authority,source_url,captured_at,content_sha256,byte_length,release_enabled) VALUES(?,?,?,?,?,?,?,?)")
     .run("na_fic_scope",1,"fic","https://www.fic.na/","2026-11-07",hash,bytes.length,1),/CHECK constraint/);
   assert.throws(()=>db.prepare("INSERT INTO na_source_review_notes(note_id,source_id,source_revision,source_sha256,reviewer_ref,finding,rationale) VALUES(?,?,?,?,?,?,?)")
     .run("orphan","unknown",1,hash,"reviewer","needs_revision","no source"),/FOREIGN KEY/);
   assert.throws(()=>db.prepare("INSERT INTO na_source_review_notes(note_id,source_id,source_revision,source_sha256,reviewer_ref,finding,rationale) VALUES(?,?,?,?,?,?,?)")
     .run("wrong-hash","na_bipa_annual_duty",1,"b".repeat(64),"synthetic-reviewer","needs_revision","Hash cannot be swapped"),/FOREIGN KEY/);
   db.prepare("INSERT INTO na_source_review_notes(note_id,source_id,source_revision,source_sha256,reviewer_ref,finding,rationale) VALUES(?,?,?,?,?,?,?)")
     .run("note-1","na_bipa_annual_duty",1,hash,"synthetic-reviewer","needs_source_verification","Source text review needed");
   assert.throws(()=>db.prepare("UPDATE na_source_review_notes SET approval_granted=1 WHERE note_id='note-1'").run(),/namibia_review_note_append_only/);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM na_source_versions").get().n,1);
 }finally{db.close()}
});
