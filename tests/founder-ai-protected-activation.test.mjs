import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createD1Adapter,runBoundedOperation,verifyAuthority,verifyLiveReleaseSeal} from '../scripts/execute-founder-ai-protected.mjs';
const identity={email:'owner@example.invalid',userId:'owner',tenantId:'tenant'};
const approvalReference='https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/123';
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT);
  CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT);
  CREATE TABLE entitlement_overrides(tenant_id TEXT,feature_key TEXT,enabled INTEGER,limit_value INTEGER,expires_at TEXT,reason TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(tenant_id,feature_key));
  CREATE TABLE audit_events(tenant_id TEXT,actor_user_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT);
  CREATE TABLE ai_credit_wallets(tenant_id TEXT,balance INTEGER,lifetime_used INTEGER);
  CREATE TABLE ai_credit_orders(tenant_id TEXT);
  INSERT INTO users VALUES('owner','owner@example.invalid');
  INSERT INTO memberships VALUES('tenant','owner','owner','active');
  INSERT INTO ai_credit_wallets VALUES('tenant',12,9);
  INSERT INTO ai_credit_orders VALUES('tenant');`);
  const db=createD1Adapter(async batch=>{
    sql.exec('BEGIN');
    try{
      const results=batch.map(({sql:statement,params})=>{
        const prepared=sql.prepare(statement);
        if(/^SELECT/i.test(statement.trim()))return {results:prepared.all(...params),meta:{changes:0}};
        return {results:[],meta:prepared.run(...params)};
      });
      sql.exec('COMMIT');return results;
    }catch(e){sql.exec('ROLLBACK');throw e}
  });
  return {db,sql};
}
test('inspect is read-only; grant and revoke preserve balance and orders and audit exactly once',async()=>{
  const {db,sql}=fixture();let checks=0;
  try{
    const run=mode=>runBoundedOperation(db,identity,{mode,approvalReference,recheck:async()=>{checks++}});
    assert.deepEqual(await run('inspect'),{mode:'inspect',enabled:false});
    assert.equal(checks,0);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM entitlement_overrides').get().n,0);
    assert.deepEqual(await run('grant'),{mode:'grant',enabled:true,verified:true,walletAndOrderCountUnchanged:true});
    assert.equal((await run('grant')).verified,true);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_events').get().n,1);
    assert.equal((await run('revoke')).enabled,false);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_events').get().n,2);
    assert.equal(sql.prepare('SELECT balance FROM ai_credit_wallets').get().balance,12);
  }finally{sql.close()}
});
test('ambiguous or mismatched identity, denied authority and audit failure prevent mutation',async()=>{
  const {db,sql}=fixture();
  const run=(subject=identity,recheck=async()=>{})=>runBoundedOperation(db,subject,{mode:'grant',approvalReference,recheck});
  try{
    await assert.rejects(run({...identity,userId:'wrong'}));
    await assert.rejects(run(identity,async()=>{throw Error('authority denied')}));
    sql.exec("INSERT INTO memberships VALUES('other','owner','owner','active')");
    await assert.rejects(run(),/founder_identity_ambiguous/);
    sql.exec("DELETE FROM memberships WHERE tenant_id='other';CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    await assert.rejects(run(),/audit failed/);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM entitlement_overrides').get().n,0);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_events').get().n,0);
  }finally{sql.close()}
});
test('non-owner, non-main, non-dispatch and stale authority fail before any network mutation',async()=>{
  const env={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'adinosassist-stack',GITHUB_TRIGGERING_ACTOR:'adinosassist-stack',EXPECTED_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GH_TOKEN:'synthetic'};
  for(const patch of [{GITHUB_ACTOR:'thusico'},{GITHUB_TRIGGERING_ACTOR:'thusico'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'push'},{GITHUB_SHA:'b'.repeat(40)}]){
    let called=false;
    await assert.rejects(verifyAuthority({...env,...patch},async()=>{called=true}),/founder_context_denied/);
    assert.equal(called,false);
  }
  await assert.rejects(verifyAuthority(env,async()=>({ok:true,json:async()=>({commit:{sha:'b'.repeat(40)}})})),/founder_stale_main/);
});

test('operation SHA uses exact still-live release BF-07 seal, rejects expired or mismatched evidence',async()=>{
  const sha='a'.repeat(40),releaseSha='b'.repeat(40);
  const manifest={release:'production',schema:1,sequence:675,sourceSha:'c'.repeat(40)};
  const env={EXPECTED_SHA:sha,GH_TOKEN:'synthetic'};
  let changed=false,expired=false,mismatch=false,wrongSeal=false;
  const git=(...args)=>{
    if(args[0]==='log')return releaseSha;
    if(args[0]==='show')return JSON.stringify(manifest);
    if(args[1]==='HEAD')return sha;
    return changed&&args[1].startsWith(sha+':')?'e'.repeat(40):'d'.repeat(40);
  };
  const respond=async url=>{
    let body;
    if(url.includes('/runs?')){assert(url.includes('head_sha='+releaseSha));body={workflow_runs:[{id:123,head_sha:wrongSeal?sha:releaseSha,head_branch:'main',event:'push',head_repository:{full_name:'adinosassist-stack/botswana-compliance-platform'},status:'completed',conclusion:'success'}]}}
    else if(url.includes('/artifacts?'))body={artifacts:[{name:'bf07-sealed-'+releaseSha,expired,expires_at:'2099-01-01T00:00:00Z',digest:'sha256:'+'1'.repeat(64)}]};
    else if(url.endsWith('/api/version'))body={ok:true,release:'production',releaseSequence:mismatch?676:675,sourceSha:manifest.sourceSha,runtimeEntry:'release-governance-entry'};
    else if(url.endsWith('/api/live'))body={ok:true};
    else throw Error('unexpected URL');
    return {ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)};
  };
  const verify=()=>verifyLiveReleaseSeal(env,{git,fetchImpl:respond});
  assert.deepEqual(await verify(),{releaseSha,runId:123});
  changed=true;await assert.rejects(verify(),/founder_release_entitlement_changed/);changed=false;
  expired=true;await assert.rejects(verify(),/founder_release_seal_artifact_missing/);expired=false;
  mismatch=true;await assert.rejects(verify(),/founder_live_release_mismatch/);mismatch=false;
  wrongSeal=true;await assert.rejects(verify(),/founder_release_seal_missing/);
});
