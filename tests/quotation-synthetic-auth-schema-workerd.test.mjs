/**
 * Checks exact review-only D1 schema in real LOCAL workerd/D1, not Cloudflare.
 * Synthetic sessions only; never creates remote resources or authorizes a
 * migration. The exact SHA below is the Git blob of the unexecuted SQL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createQuotationPrivateD1SessionVerifier} from '../server/quotation-private-d1-session-verifier.mjs';
const sqlBytes=readFileSync(new URL('../docs/sql/quotation-synthetic-auth-staging-candidate.sql',import.meta.url));
const sha=createHash('sha1').update(Buffer.from('blob '+sqlBytes.length+'\0')).update(sqlBytes).digest('hex');
const approvedCandidateBlob='12f00643c9dd41511b802b74aafdc35aace874bd';
const tenant='123e4567-e89b-42d3-a456-426614174000';
const foreign='11111111-1111-4111-8111-111111111111';
const user='synthetic_reviewer_one';
const secret='synthetic-secret-for-local-only-not-production';
const cookie='synthetic-test-cookie-with-entropy-placeholder';
const csrf='synthetic-csrf-token-local-only';
const tokenHash=createHmac('sha256',secret).update(cookie).digest('hex');
function statements(){
 assert.equal(sha,approvedCandidateBlob,'exact SQL candidate bytes changed; re-review required');
 const list=splitSqliteMigrationStatements(sqlBytes.toString('utf8'));
 assert.equal(list.length,3,'only the 3 explicit CREATE statements may be rehearsed');
 for(const [i,stmt] of list.entries()){
  const clean=stmt.replace(/--[^\n]*/g,'').trim();
  assert.match(clean,new RegExp('^CREATE TABLE (users|memberships|sessions) \\('));
  assert.equal(clean.startsWith('CREATE TABLE '+['users','memberships','sessions'][i]),true);
  assert.doesNotMatch(clean,/\b(DROP|ALTER|UPDATE|DELETE|INSERT|REPLACE|ATTACH|PRAGMA)\b/i);
  assert.doesNotMatch(clean,/IF NOT EXISTS/i);
 }
 return list;
}
async function localDb(t){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,
  script:'export default {fetch(){return new Response("inert")}}',
  compatibilityDate:'2026-09-25',
  d1Databases:{AUTH:'local-quotation-synthetic-identity-only'}
 }));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('AUTH');
 const prior=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') ORDER BY name").all();
 assert.deepEqual(prior.results,[],'unexpected application table; abort');
 for(const sql of statements())assert.equal((await db.prepare(sql).run()).success,true);
 return db;
}
async function seed(db){
 await db.prepare('INSERT INTO users(id,session_generation) VALUES (?,?)').bind(user,1).run();
 await db.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES (?,?,?,?)').bind(tenant,user,'owner','active').run();
 await db.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)')
  .bind(tokenHash,user,tenant,csrf,1,'2099-12-31 23:59:59').run();
}
function auth(db){
 return createQuotationPrivateD1SessionVerifier({
  enabled:true,environment:'quotation-private-staging',
  expectedTenantId:tenant,sessionSecret:secret,authDb:db
 });
}
const req=()=>new Request('https://synthetic.private.example.test/',{
 headers:{cookie:'__Host-bw_session='+cookie,'x-csrf-token':csrf}
});
test('exact unexecuted candidate builds only 3 local synthetic identity tables',async t=>{
 const db=await localDb(t);
 const schema=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') ORDER BY name").all();
 assert.deepEqual(schema.results,[{name:'memberships'},{name:'sessions'},{name:'users'}]);
 await assert.rejects(db.prepare(statements()[0]).run(),'replay should fail rather than silently succeed');
});
test('real local D1 resolves an approved synthetic signed session and active membership',async t=>{
 const db=await localDb(t);await seed(db);
 const verifier=auth(db);
 assert.deepEqual(await verifier.readVerifiedSession({request:req()}),{
  authenticated:true,userId:user,tenantId:tenant,role:'owner'
 });
 assert.deepEqual(await verifier.verifyActiveMembership({
  actor:{userId:user,tenantId:tenant,role:'owner'},tenantId:tenant,userId:user
 }),{active:true,tenantId:tenant,userId:user,role:'owner'});
 assert.equal(await verifier.verifyMutation({
  actor:{userId:user,tenantId:tenant,role:'owner'},companyId:tenant,request:req()
 }),true);
});
test('isolated D1 rejects invalid roles, statuses, duplicate hashes and cross-tenant references',async t=>{
 const db=await localDb(t);await seed(db);
 const invalid=[
  ()=>db.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES (?,?,?,?)').bind(foreign,user,'superadmin','active').run(),
  ()=>db.prepare('UPDATE memberships SET status=? WHERE tenant_id=? AND user_id=?').bind('pending',tenant,user).run(),
  ()=>db.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)').bind(tokenHash,user,tenant,csrf,1,'2099-12-31 23:59:59').run(),
  ()=>db.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)').bind('a'.repeat(64),user,foreign,csrf,1,'2099-12-31 23:59:59').run()
 ];
 for(const operation of invalid)await assert.rejects(operation());
});
test('real local D1 denies membership revocation, stale generation, expired session and other tenant',async t=>{
 const db=await localDb(t);await seed(db);
 const verifier=auth(db);
 await db.prepare('UPDATE memberships SET status=? WHERE tenant_id=? AND user_id=?').bind('disabled',tenant,user).run();
 assert.equal(await verifier.readVerifiedSession({request:req()}),null);
 await db.prepare('UPDATE memberships SET status=? WHERE tenant_id=? AND user_id=?').bind('active',tenant,user).run();
 await db.prepare('UPDATE users SET session_generation=? WHERE id=?').bind(2,user).run();
 assert.equal(await verifier.readVerifiedSession({request:req()}),null);
 await db.prepare('UPDATE users SET session_generation=? WHERE id=?').bind(1,user).run();
 await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2020-01-01 00:00:00',tokenHash).run();
 assert.equal(await verifier.readVerifiedSession({request:req()}),null);
 await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2099-12-31 23:59:59',tokenHash).run();
 const bad=await db.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES (?,?,?,?)').bind(foreign,user,'owner','active').run();
 assert.equal(bad.success,true);
 await db.prepare('UPDATE sessions SET tenant_id=? WHERE token_hash=?').bind(foreign,tokenHash).run();
 assert.equal(await verifier.readVerifiedSession({request:req()}),null);
});
