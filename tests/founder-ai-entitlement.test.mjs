import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setFounderAiEntitlement} from '../scripts/founder-ai-entitlement.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/src/worker.js';
import {handleAgenticLiveVoiceRequest} from '../cloudflare/src/agentic-live-voice.js';
import {hasFounderAiEntitlement,FOUNDER_AI_FEATURE,founderAiSubject} from '../cloudflare/src/founder-ai-entitlement.js';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('cloudflare/schema.sql','utf8'));
  const DB={prepare(sql){
    return {
      args:[],
      bind(...args){this.args=args;return this},
      first(){return sqlite.prepare(sql).get(...this.args)||null},
      all(){return {results:sqlite.prepare(sql).all(...this.args)}},
      run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...this.args).changes)}}}
    };
  }};
  DB.batch=async statements=>{sqlite.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}};
  const env={DB,SESSION_SECRET:'synthetic-founder-session-secret',AUDIT_INTEGRITY_SECRET:'synthetic-founder-audit-secret',PUBLIC_ORIGIN:'https://app.example',AI:{async run(){return {response:JSON.stringify({answer:'Synthetic answer.',confidence:'low',actions:[],caveats:[],sourceRefs:[]})}}}};
  for(const tenant of ['workspace','other']){
    sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(tenant,tenant);
    sqlite.prepare("INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,'business','active')").run(tenant);
    sqlite.prepare('INSERT INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,40)').run(tenant);
  }
  for(const user of ['founder','colleague']){
    sqlite.prepare('INSERT INTO users(id,email) VALUES(?,?)').run(user,`${user}@example.invalid`);
    for(const tenant of ['workspace','other']){
      sqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run(tenant,user);
      const token=`${user}-${tenant}`;
      const hash=createHmac('sha256',env.SESSION_SECRET).update(token).digest('hex');
      sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,'owner','csrf',datetime('now','+1 day'))").run(hash,user,tenant);
    }
  }
  const grant=()=>sqlite.prepare('INSERT OR REPLACE INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,expires_at,reason) VALUES(?,?,1,NULL,NULL,?)').run('workspace',FOUNDER_AI_FEATURE,founderAiSubject('founder'));
  const ask=async(user='founder',tenant='workspace',extra={})=>{
    const response=await worker.fetch(new Request('https://app.example/api/ai/advisor',{method:'POST',headers:{cookie:`__Host-bw_session=${user}-${tenant}`,'x-csrf-token':'csrf','content-type':'application/json'},body:JSON.stringify({mode:'ask',question:'What needs attention?',...extra})}),env,{});
    return {status:response.status,body:await response.json()};
  };
  const wallet=()=>({...sqlite.prepare("SELECT balance,lifetime_used FROM ai_credit_wallets WHERE tenant_id='workspace'").get()});
  return {sqlite,env,grant,ask,wallet};
}

test('approved founder chat succeeds repeatedly at zero balance and records zero usage',async()=>{
  const f=fixture();f.grant();const before=f.wallet();
  f.sqlite.prepare("INSERT INTO ai_cost_controls(tenant_id,monthly_credit_cap) VALUES('workspace',0)").run();
  for(let i=0;i<2;i++){
    const result=await f.ask();assert.equal(result.status,200);assert.equal(result.body.generationMode,'workers_ai');
    assert.equal(result.body.creditsUsed,0);assert.equal(result.body.creditFunding,'founder_entitlement');
  }
  assert.deepEqual(f.wallet(),before);
  const ledger=f.sqlite.prepare("SELECT credits,metadata_json FROM ai_credit_ledger WHERE entry_type='usage'").all();
  assert.equal(ledger.length,2);assert(ledger.every(x=>x.credits===0&&JSON.parse(x.metadata_json).actorUserId==='founder'));
  assert.equal(f.sqlite.prepare('SELECT SUM(credits_used) total FROM ai_advisor_runs').get().total,0);
});

test('same-workspace users and other workspaces cannot inherit or spoof the exemption',async()=>{
  const f=fixture();f.grant();
  for(const [user,tenant] of [['colleague','workspace'],['founder','other']]){
    const r=await f.ask(user,tenant,{userId:'founder',tenantId:'workspace',creditExempt:true});
    assert.equal(r.status,402);assert.equal(r.body.error,'insufficient_ai_credits');
  }
  f.sqlite.prepare("UPDATE ai_credit_wallets SET balance=20 WHERE tenant_id='workspace'").run();
  const ordinary=await f.ask('colleague');assert.equal(ordinary.status,200);assert.equal(ordinary.body.creditsUsed,6);
  assert.deepEqual(f.wallet(),{balance:14,lifetime_used:6});
});

test('revocation, disabled membership, wrong subject and malformed grants fail closed',async()=>{
  for(const mutation of ["enabled=0","expires_at='2999-01-01'","limit_value=10000","reason='founder_ai_subject:colleague'"]){
    const f=fixture();f.grant();f.sqlite.exec(`UPDATE entitlement_overrides SET ${mutation}`);
    assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),false);
    assert.equal((await f.ask()).status,402);
  }
  for(const change of ["status='inactive'","role='manager'"]){
    const f=fixture();f.grant();f.sqlite.exec(`UPDATE memberships SET ${change} WHERE user_id='founder'`);
    assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),false);
  }
});

test('founder provider failure cannot mint a refund or change the wallet',async()=>{
  const f=fixture();f.grant();const before=f.wallet();f.env.AI.run=async()=>{throw new Error('synthetic provider failure')};
  const result=await f.ask();assert.equal(result.status,200);assert.equal(result.body.generationMode,'structured_fallback');assert.equal(result.body.creditsUsed,0);
  assert.deepEqual(f.wallet(),before);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='refund'").get().n,0);
});

test('provider spending controls still stop exempt chat',async()=>{
  const f=fixture();f.grant();let called=false;f.env.AI.run=async()=>{called=true};
  f.sqlite.prepare("INSERT INTO ai_cost_controls(tenant_id,monthly_cost_cap_bwp) VALUES('workspace',0)").run();
  const r=await f.ask();assert.equal(r.status,402);assert.equal(r.body.error,'monthly_ai_cost_cap_reached');assert.equal(called,false);assert.deepEqual(f.wallet(),{balance:0,lifetime_used:0});
});

test('failed exemption usage audit prevents the provider request',async()=>{
  const f=fixture();f.grant();let called=false;f.env.AI.run=async()=>{called=true};
  f.sqlite.exec("CREATE TRIGGER deny_ledger BEFORE INSERT ON ai_credit_ledger BEGIN SELECT RAISE(ABORT,'synthetic ledger failure'); END");
  await assert.rejects(f.ask(),/synthetic ledger failure/);assert.equal(called,false);assert.deepEqual(f.wallet(),{balance:0,lifetime_used:0});
});


test('authenticated live voice starts at zero balance without charging; safety gates remain active',async()=>{
  const f=fixture();f.grant();Object.assign(f.env,{THEBE_LIVE_VOICE_ENABLED:'1',OPENAI_API_KEY:'synthetic-key-long-enough-for-voice-tests',AGENT_RUNTIME_ENABLED:'1'});
  const originalFetch=globalThis.fetch;let upstreamCalls=0;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/realtime/calls');assert(options.body instanceof FormData);
    upstreamCalls++;
    return new Response('v=0\r\ns=synthetic voice\r\n',{status:201,headers:{location:'https://api.openai.com/v1/realtime/calls/synthetic-session'}});
  };
  const voice=()=>handleAgenticLiveVoiceRequest({request:new Request('https://app.example/api/agentic/live/session',{method:'POST',headers:{cookie:'__Host-bw_session=founder-workspace','x-csrf-token':'csrf',origin:'https://app.example','content-type':'application/json'},body:JSON.stringify({sdp:'v=0\r\ns=synthetic offer\r\n'})}),env:f.env,ctx:{}});
  try{
    const before=f.wallet();const response=await voice();assert.equal(response.status,201);assert.equal((await response.json()).ok,true);
    assert.deepEqual(f.wallet(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ai_credit_ledger').get().n,0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='THEBE_LIVE_SESSION_STARTED'").get().n,1);
    f.env.AGENT_RUNTIME_KILL_SWITCH='1';assert.equal((await voice()).status,503);assert.equal(upstreamCalls,1);
    assert.deepEqual(f.wallet(),before);
  }finally{globalThis.fetch=originalFetch}
});


const approvedOperation={tenantId:'workspace',userId:'founder',email:'founder@example.invalid',enabled:true,approvalReference:'https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/123',inspectOnly:false};

test('grant and revoke are narrow, auditable, idempotent and default to inspection',async()=>{
  const f=fixture();const before=f.wallet();
  const inspect=await setFounderAiEntitlement(f.env.DB,{...approvedOperation,inspectOnly:undefined});assert.equal(inspect.mode,'inspect');
  assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),false);
  await assert.rejects(setFounderAiEntitlement(f.env.DB,{...approvedOperation,approvalReference:undefined}),/approval run/);
  await assert.rejects(setFounderAiEntitlement(f.env.DB,{...approvedOperation,email:'incorrect@example.invalid'}),/identity does not match/);
  assert.equal((await setFounderAiEntitlement(f.env.DB,approvedOperation)).verified,true);
  assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),true);
  assert.equal((await setFounderAiEntitlement(f.env.DB,approvedOperation)).mode,'unchanged');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='FOUNDER_AI_ENTITLEMENT_GRANTED'").get().n,1);
  assert.equal((await setFounderAiEntitlement(f.env.DB,{...approvedOperation,enabled:false})).verified,true);
  assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),false);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='FOUNDER_AI_ENTITLEMENT_REVOKED'").get().n,1);
  assert.deepEqual(f.wallet(),before);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM entitlement_overrides').get().n,1);
});

test('grant rolls back on audit failure and refuses another account grant',async()=>{
  const f=fixture();f.sqlite.exec("CREATE TRIGGER deny_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
  await assert.rejects(setFounderAiEntitlement(f.env.DB,approvedOperation),/synthetic audit failure/);
  assert.equal(await hasFounderAiEntitlement(f.env,'workspace','founder'),false);
  f.grant();
  await assert.rejects(setFounderAiEntitlement(f.env.DB,{...approvedOperation,userId:'colleague',email:'colleague@example.invalid'}),/Conflicting entitlement/);
});
