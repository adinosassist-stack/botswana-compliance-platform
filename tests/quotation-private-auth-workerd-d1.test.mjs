/**
 * Local workerd + D1 rehearsal for the unmounted quotation authentication.
 * All identities and sessions are synthetic in ephemeral Miniflare storage.
 * No remote Cloudflare API, customer data, PDF upload, or public routes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const tenant='123e4567-e89b-42d3-a456-426614174000';
const other='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const origin='https://quotation-auth.private.example.test';
const cookie='synthetic-cookie-rehearsal-only-123456789';
const secret='synthetic-session-secret-no-production-data-123456';
const csrf='synthetic-csrf-token-private-test';
const hash=createHmac('sha256',secret).update(cookie).digest('hex');
function inlineFactory(path,symbol){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const needle='export function '+symbol;
 assert.ok(source.includes(needle),'expected source export');
 return 'const '+symbol+'=(()=>{\n'+source.replace(needle,'function '+symbol)+
  '\nreturn '+symbol+';\n})();';
}
const workerScript=[
 inlineFactory('../server/quotation-private-d1-session-verifier.mjs','createQuotationPrivateD1SessionVerifier'),
 inlineFactory('../server/quotation-private-host-session-gate.mjs','createQuotationPrivateHostSessionGate'),
 "export default {",
 "async fetch(request,env){",
 "const auth=createQuotationPrivateD1SessionVerifier({enabled:true,environment:'quotation-private-staging',authDb:env.AUTH,expectedTenantId:'123e4567-e89b-42d3-a456-426614174000',sessionSecret:'synthetic-session-secret-no-production-data-123456'});",
 "const host=createQuotationPrivateHostSessionGate({enabled:true,environment:'quotation-private-staging',expectedTenantId:'123e4567-e89b-42d3-a456-426614174000',allowedPrivateOrigin:'https://quotation-auth.private.example.test',...auth,quotationHandlers:{async handle({request,actor,companyId}){",
 "if(new URL(request.url).pathname!=='/rehearsal/synthetic')return new Response('not_found',{status:404});",
 "return Response.json({synthetic:true,tenantId:companyId,role:actor.role});",
 "}}});",
 "return host.handle(request);",
 "}",
 "};"
].join('\n');
async function fixture(t){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:workerScript,compatibilityDate:'2026-09-25',
  d1Databases:{AUTH:'quotation-auth-synthetic-local-only'}
 }));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('AUTH');
 for(const sql of [
  'CREATE TABLE users (id TEXT PRIMARY KEY,session_generation INTEGER NOT NULL)',
  'CREATE TABLE memberships (tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id))',
  'CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,csrf_token TEXT NOT NULL,session_generation INTEGER NOT NULL,expires_at TEXT NOT NULL)'
 ])assert.equal((await db.prepare(sql).run()).success,true);
 await db.prepare('INSERT INTO users(id,session_generation) VALUES (?,?)').bind(user,1).run();
 await db.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES (?,?,?,?)')
  .bind(tenant,user,'owner','active').run();
 await db.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)')
  .bind(hash,user,tenant,csrf,1,'2099-12-31 23:59:59').run();
 const send=(path='/rehearsal/synthetic',init={})=>mf.dispatchFetch(origin+path,init);
 const headers=(v=csrf,from=origin)=>({
  cookie:'__Host-bw_session='+cookie,origin:from,'x-csrf-token':v
 });
 return {mf,db,send,headers};
}
test('workerd D1: signed synthetic session pins tenant and permits valid CSRF write',async t=>{
 const f=await fixture(t);
 const r=await f.send('/rehearsal/synthetic?tenantId='+other,{headers:f.headers()});
 assert.equal(r.status,200,await r.clone().text());
 assert.deepEqual(await r.json(),{synthetic:true,tenantId:tenant,role:'owner'});
 const write=await f.send('/rehearsal/synthetic',{method:'POST',headers:f.headers(),body:'synthetic-only'});
 assert.equal(write.status,200,await write.clone().text());
});
test('workerd D1: absent session, bad origin and invalid CSRF denied',async t=>{
 const f=await fixture(t);
 assert.equal((await f.send()).status,401);
 assert.equal((await f.send('/rehearsal/synthetic',{
  method:'POST',headers:f.headers('incorrect-synthetic-token')
 })).status,403);
 assert.equal((await f.send('/rehearsal/synthetic',{
  method:'POST',headers:f.headers(csrf,'https://wrong.example.test')
 })).status,403);
 assert.equal((await f.mf.dispatchFetch('https://thebedesk.com/rehearsal/synthetic',{
  headers:f.headers()
 })).status,404);
});
test('workerd D1: staff write denial, revocation, stale session denied',async t=>{
 const f=await fixture(t);
 await f.db.prepare('UPDATE memberships SET role=? WHERE tenant_id=? AND user_id=?')
  .bind('staff',tenant,user).run();
 const read=await f.send('/rehearsal/synthetic',{headers:f.headers()});
 assert.equal(read.status,200);
 assert.equal((await read.json()).role,'staff');
 assert.equal((await f.send('/rehearsal/synthetic',{
  method:'POST',headers:f.headers(),body:'synthetic-only'
 })).status,403);
 await f.db.prepare('UPDATE memberships SET status=? WHERE tenant_id=? AND user_id=?')
  .bind('disabled',tenant,user).run();
 assert.equal((await f.send('/rehearsal/synthetic',{headers:f.headers()})).status,401);
 await f.db.prepare('UPDATE memberships SET status=?,role=? WHERE tenant_id=? AND user_id=?')
  .bind('active','owner',tenant,user).run();
 await f.db.prepare('UPDATE users SET session_generation=? WHERE id=?').bind(2,user).run();
 assert.equal((await f.send('/rehearsal/synthetic',{headers:f.headers()})).status,401);
});
test('workerd D1: cross-tenant session and expiry both deny',async t=>{
 const f=await fixture(t);
 await f.db.prepare('UPDATE sessions SET tenant_id=? WHERE token_hash=?').bind(other,hash).run();
 assert.equal((await f.send('/rehearsal/synthetic',{headers:f.headers()})).status,401);
 await f.db.prepare('UPDATE sessions SET tenant_id=?,expires_at=? WHERE token_hash=?')
  .bind(tenant,'2020-01-01 00:00:00',hash).run();
 assert.equal((await f.send('/rehearsal/synthetic',{headers:f.headers()})).status,401);
});
