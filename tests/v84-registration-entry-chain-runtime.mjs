import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import releaseEntry from "../cloudflare/src/release-governance-entry.js";

class TestD1Statement{
  constructor(database,sql){this.database=database;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  first(){const row=this.database.prepare(this.sql).get(...this.args);return row?{...row}:null}
  all(){return {results:this.database.prepare(this.sql).all(...this.args).map(row=>({...row}))}}
  run(){const result=this.database.prepare(this.sql).run(...this.args);return {meta:{changes:Number(result.changes||0)}}}
}
class TestD1{
  constructor(database){this.database=database}
  prepare(sql){return new TestD1Statement(this.database,sql)}
  batch(statements){
    this.database.exec("BEGIN IMMEDIATE");
    try{
      const results=statements.map(statement=>statement.run());
      this.database.exec("COMMIT");
      return results;
    }catch(error){
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function leadingZeroBits(bytes,bits){
  let remaining=Number(bits)||0;
  for(const value of bytes){
    if(remaining<=0)return true;
    const take=Math.min(8,remaining);
    if((value>>(8-take))!==0)return false;
    remaining-=take;
  }
  return remaining<=0;
}
async function solve(token,difficulty){
  const encoder=new TextEncoder();
  for(let counter=0;counter<=500000;counter++){
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(`${token}:${counter}`)));
    if(leadingZeroBits(digest,difficulty))return counter;
  }
  throw new Error("proof_of_work_not_found");
}

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
sqlite.exec(fs.readFileSync(new URL("../cloudflare/migrations/069_legal_acceptance_evidence.sql",import.meta.url),"utf8"));
const DB=new TestD1(sqlite);
const env={
  DB,
  REGISTRATION_MODE:"open",
  PUBLIC_ORIGIN:"https://thebedesk.com",
  PUBLIC_APP_URL:"https://thebedesk.com",
  AUTOMATION_SECRET:"test-only-automation-material-not-a-secret-000000000",
  SESSION_SECRET:"test-only-session-material-not-a-secret-000000000000",
  AUDIT_INTEGRITY_SECRET:"test-only-audit-material-not-a-secret-0000000000000",
  TURNSTILE_SECRET_KEY:"test-only-legacy-verifier-value",
  APP_ENV:"production"
};
const ip="198.51.100.42";
const origin="https://thebedesk.com";
const ctx={waitUntil(){}};
const testPassword=["TEST","ONLY","NOT","A","SECRET","registration","2026!"].join("-");

const challengeRequest=new Request(`${origin}/api/auth/registration-proof/challenge`,{
  method:"POST",
  headers:{"content-type":"application/json","origin":origin,"cf-connecting-ip":ip},
  body:"{}"
});
const challengeResponse=await releaseEntry.fetch(challengeRequest,env,ctx);
assert.equal(challengeResponse.status,200);
const challenge=await challengeResponse.json();
assert.equal(challenge.provider,"thebe_proof");
assert.equal(challenge.required,true);
assert.equal(challenge.action,"register");
assert.ok(typeof challenge.token==="string"&&challenge.token.includes("."));
assert.ok(Number.isInteger(challenge.difficulty));

const challengeBudget=sqlite.prepare("SELECT count FROM auth_rate_limits WHERE scope='registration_proof_challenge_ip'").get();
assert.equal(Number(challengeBudget?.count||0),1,"full entry chain must consume the durable challenge budget exactly once");

const counter=await solve(challenge.token,challenge.difficulty);
const proof=JSON.stringify({challenge:challenge.token,counter,honeypot:""});
const registrationBody={
  email:"sequence84-adversarial@example.com",
  password:testPassword,
  companyName:"Sequence 84 Adversarial",
  plan:"business",
  turnstileToken:proof,
  legalAccepted:true
};
const registerRequest=(body=registrationBody)=>new Request(`${origin}/api/auth/register`,{
  method:"POST",
  headers:{"content-type":"application/json","origin":origin,"cf-connecting-ip":ip},
  body:JSON.stringify(body)
});

const consentlessResponse=await releaseEntry.fetch(registerRequest({...registrationBody,legalAccepted:false}),env,ctx);
assert.equal(consentlessResponse.status,428,"server boundary must reject registration without explicit legal acceptance");
const consentlessPayload=await consentlessResponse.json();
assert.equal(consentlessPayload.error,"legal_acceptance_required");
assert.equal(sqlite.prepare("SELECT count(*) count FROM users WHERE email=?").get(registrationBody.email).count,0);
assert.equal(sqlite.prepare("SELECT count(*) count FROM auth_rate_limits WHERE scope='registration_proof_replay'").get().count,0,"consent rejection must not burn the one-time proof");

const registrationResponse=await releaseEntry.fetch(registerRequest(),env,ctx);
assert.equal(registrationResponse.status,202,"a valid proof plus legal acceptance must survive the complete release -> agentic -> production -> Worker chain");
const registrationPayload=await registrationResponse.json();
assert.equal(registrationPayload.ok,true);
assert.equal(sqlite.prepare("SELECT count(*) count FROM users WHERE email=?").get(registrationBody.email).count,1);
assert.equal(sqlite.prepare("SELECT count(*) count FROM memberships WHERE user_id=(SELECT id FROM users WHERE email=?) AND role='owner' AND status='active'").get(registrationBody.email).count,1);
assert.equal(sqlite.prepare("SELECT count(*) count FROM auth_rate_limits WHERE scope='registration_proof_replay'").get().count,1,"proof nonce must be claimed exactly once");

const acceptance=sqlite.prepare(`SELECT terms_version,privacy_version,accepted_at,source
  FROM legal_acceptances WHERE user_id=(SELECT id FROM users WHERE email=?) LIMIT 1`).get(registrationBody.email);
assert.equal(acceptance?.terms_version,"2026-10-14");
assert.equal(acceptance?.privacy_version,"2026-10-14");
assert.ok(String(acceptance?.accepted_at||"").length>=20,"server must persist an acceptance timestamp");
assert.equal(acceptance?.source,"password_registration");
const audit=sqlite.prepare(`SELECT event_type,entity_type,event_data,event_hash,tenant_seq
  FROM audit_events WHERE event_type='LEGAL_ACCEPTANCE_RECORDED' LIMIT 1`).get();
assert.equal(audit?.event_type,"LEGAL_ACCEPTANCE_RECORDED");
assert.equal(audit?.entity_type,"legal_acceptance");
assert.ok(String(audit?.event_hash||"").length===64,"legal acceptance must be sealed into the tamper-evident audit chain");
assert.equal(Number(audit?.tenant_seq||0),1);
const auditData=JSON.parse(audit.event_data);
assert.equal(auditData.termsVersion,"2026-10-14");
assert.equal(auditData.privacyVersion,"2026-10-14");
assert.equal(auditData.acceptedAt,acceptance.accepted_at);

const replayResponse=await releaseEntry.fetch(registerRequest(),env,ctx);
assert.equal(replayResponse.status,403,"the same one-time proof must still be rejected on replay");
const replayPayload=await replayResponse.json();
assert.equal(replayPayload.error,"registration_protection_failed");
assert.equal(sqlite.prepare("SELECT count(*) count FROM users WHERE email=?").get(registrationBody.email).count,1);
assert.equal(sqlite.prepare("SELECT count(*) count FROM legal_acceptances WHERE user_id=(SELECT id FROM users WHERE email=?)").get(registrationBody.email).count,1,"replay must not create duplicate consent evidence");

console.log("V84 full registration entry-chain legal-consent runtime: PASS");
