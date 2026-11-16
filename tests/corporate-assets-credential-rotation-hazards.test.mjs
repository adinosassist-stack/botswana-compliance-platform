/** Synthetic-only key replacement hazards in the canonical Thebe Worker.
 * No Cloudflare requests, real secrets, remote D1, Worker upload or deployment.
 * Audit-chain portion is a pinned HMAC-SHA256 model of the source algorithm,
 * NOT a live verifyAuditChain acceptance test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {authenticateWorkspaceSession} from '../cloudflare/src/worker.js';

const oldSessionKey='synthetic-old-session-key-'+('a'.repeat(32));
const newSessionKey='synthetic-new-session-key-'+('b'.repeat(32));
const oldAuditKey='synthetic-old-audit-key-'+('c'.repeat(32));
const newAuditKey='synthetic-new-audit-key-'+('d'.repeat(32));
const raw='synthetic-browser-session-cookie-no-customer-data';
const hmac=(key,message)=>createHmac('sha256',key).update(message).digest('hex');
const url='https://staging-only.invalid/api/auth/me';

function sessionFixture(storedHash){
 const calls=[];
 const row={user_id:'user-synthetic',tenant_id:'tenant-synthetic',
  role:'owner',session_role:'owner',session_public_id:'synthetic-public-session',
  csrf_token:'synthetic-csrf',created_at:new Date().toISOString(),
  last_seen_at:new Date().toISOString(),expires_at:'2099-01-01T00:00:00Z',
  email:'example@invalid.test',display_name:'Synthetic User',
  onboarding_complete:1,tenant_name:'Synthetic Tenant'};
 const DB={prepare(sql){
  calls.push({action:'prepare',sql});
  if(!sql.includes('FROM sessions s JOIN users u')||!sql.includes('s.token_hash=?'))
   throw Error('unexpected_database_query');
  return {bind(hash){
   calls.push({action:'bind',hash});
   return {first:async()=>{
    calls.push({action:'first'});
    return hash===storedHash?row:null;
   }};
  }};
 }};
 return {DB,row,calls};
}
const callAuth=async(secret,DB,name='__Host-bw_session')=>
 authenticateWorkspaceSession(new Request(url,{headers:{cookie:name+'='+encodeURIComponent(raw)}}),
  {SESSION_SECRET:secret,DB});

test('canonical Worker auth accepts original synthetic cookie only with matching original key',async()=>{
 const record=sessionFixture(hmac(oldSessionKey,raw));
 assert.equal((await callAuth(oldSessionKey,record.DB))?.user_id,record.row.user_id);
 assert.equal((await callAuth(newSessionKey,record.DB)),null);
 const hashes=record.calls.filter(x=>x.action==='bind').map(x=>x.hash);
 assert.deepEqual(hashes,[hmac(oldSessionKey,raw),hmac(newSessionKey,raw)]);
 assert.equal(record.calls.some(x=>x.sql?.includes('UPDATE ')),false);
});
test('after synthetic key rotation a newly issued session works with new key, not old',async()=>{
 const record=sessionFixture(hmac(newSessionKey,raw));
 assert.equal((await callAuth(oldSessionKey,record.DB)),null);
 assert.equal((await callAuth(newSessionKey,record.DB))?.session_public_id,'synthetic-public-session');
 assert.equal(record.calls.some(x=>x.sql?.includes('INSERT ')||x.sql?.includes('UPDATE ')),false);
});
test('legacy cookie name has the same key-dependent behavior',async()=>{
 const record=sessionFixture(hmac(oldSessionKey,raw));
 assert.equal((await callAuth(oldSessionKey,record.DB,'bw_session'))?.role,'owner');
 assert.equal(await callAuth(newSessionKey,record.DB,'bw_session'),null);
});
test('missing cookie or secret cannot query the session database',async()=>{
 const f=sessionFixture(hmac(oldSessionKey,raw));
 assert.equal(await authenticateWorkspaceSession(new Request(url),{SESSION_SECRET:oldSessionKey,DB:f.DB}),null);
 assert.equal(await authenticateWorkspaceSession(
  new Request(url,{headers:{cookie:'__Host-bw_session='+encodeURIComponent(raw)}}),
  {SESSION_SECRET:'',DB:f.DB}),null);
 assert.deepEqual(f.calls,[]);
});

const stable=(v)=>{
 if(v===null||typeof v!=='object')return v;
 if(Array.isArray(v))return v.map(stable);
 return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
};
const canonical=x=>JSON.stringify(stable(x));
const auditInput={
 tenantId:'synthetic-tenant',seq:1,actorUserId:'synthetic-user',eventType:'asset_created',
 entityType:'asset',entityId:'synthetic-asset',
 eventData:{asset:{label:'synthetic',cost:12},test:true},
 occurredAt:'2026-11-15T00:00:00.000Z',prevHash:'GENESIS',integrityVersion:1
};
test('synthetic audit HMAC is invalid under replacement key and remains unchanged in stored event',()=>{
 const message=canonical(auditInput);
 const storedHash=hmac(oldAuditKey,message);
 assert.equal(hmac(oldAuditKey,message),storedHash);
 assert.notEqual(hmac(newAuditKey,message),storedHash);
 assert.equal(storedHash.length,64);
 assert.notEqual(storedHash,oldAuditKey);
});
test('audit key risk model stays anchored to canonical source algorithm; no false live-verification claim',()=>{
 const source=readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
 const auth=source.match(/async function auth\(req,env\)\{[\s\S]*?\n\}/)?.[0]||'';
 const event=source.match(/async function appendAuditEvent\(env,\{[\s\S]*?\n\}/)?.[0]||'';
 const verify=source.match(/async function verifyAuditChain\(env,tenantId\)\{[\s\S]*?\n\}/)?.[0]||'';
 assert.match(auth,/hmacHex\(env\.SESSION_SECRET,raw\)/);
 assert.match(auth,/WHERE s\.token_hash=\?/);
 assert.match(event,/hmacHex\(integritySecret,hashInput\)/);
 assert.match(verify,/const integritySecret=env\.AUDIT_INTEGRITY_SECRET/);
 assert.match(verify,/hmacHex\(integritySecret,hashInput\)/);
 assert.match(verify,/expectedHash!==row\.event_hash/);
});
test('synthetic secret values are never included in an acceptance receipt',()=>{
 const receipt={schema:'thebe.assets.key-rotation-hazards.v1',
  canonicalSessionReauthenticationRequired:true,
  historicalAuditChainVerificationRequiresKeyStrategy:true,
  liveSessionAcceptanceVerified:false,liveAuditIntegrityVerified:false,
  rollbackAcceptanceVerified:false,sourceUploadProvenanceVerified:false,
  stagingDeploymentAuthorized:false,productionChanged:false};
 const out=JSON.stringify(receipt);
 for(const key of [oldSessionKey,newSessionKey,oldAuditKey,newAuditKey,raw])
  assert.equal(out.includes(key),false);
 for(const flag of ['liveSessionAcceptanceVerified','liveAuditIntegrityVerified',
  'rollbackAcceptanceVerified','sourceUploadProvenanceVerified','stagingDeploymentAuthorized'])
  assert.equal(receipt[flag],false);
});
