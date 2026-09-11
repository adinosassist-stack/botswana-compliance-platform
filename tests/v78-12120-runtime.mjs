import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker,{__v782120Test,__seoTest} from '../cloudflare/src/worker.js';
class St{constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}first(){const r=this.db.prepare(this.sql).get(...this.args);return r?{...r}:null}all(){return {results:this.db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}}
class D1{constructor(db){this.db=db}prepare(sql){return new St(this.db,sql)}batch(ss){this.db.exec('BEGIN IMMEDIATE');try{const r=ss.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}}
assert.equal(__v782120Test.safeNextPath('/ok?x=1#y'),'/ok?x=1#y');
for(const bad of ['//evil.example','/\\evil.example','/\\\\evil.example','https://evil.example/x'])assert.equal(__v782120Test.safeNextPath(bad),'/',`redirect must fail closed: ${bad}`);
assert.equal(__seoTest.configuredSeoOrigin({PUBLIC_APP_URL:'http://insecure.example'}),null);
assert.equal(__seoTest.configuredSeoOrigin({PUBLIC_APP_URL:'https://app.example/path'}),'https://app.example/');
const robots=await __seoTest.seoRobotsResponse({},new URL('https://preview.workers.dev/'));assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \/$/m);assert.match(robots.headers.get('x-robots-tag')||'',/noindex/);
const sitemap=__seoTest.seoSitemapResponse({},new URL('https://preview.workers.dev/'));assert.equal(sitemap.status,503);
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));const DB=new D1(sqlite);
const secret='v78-12120-secret',raw='session-token',csrf='csrf-token',hash=createHmac('sha256',secret).update(raw).digest('hex');
sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('t1','Tenant One');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u1','user@example.com','User');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u1','manager','active');
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(hash,'u1','t1','manager',csrf);
sqlite.prepare('INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)').run('t1','business','active');
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:'audit-secret',PUBLIC_ORIGIN:'https://app.example',PUBLIC_APP_URL:'https://app.example'};
const req=(path,o={})=>new Request(`https://app.example${path}`,{...o,headers:{cookie:`__Host-bw_session=${raw}`,'x-csrf-token':csrf,'content-type':'application/json',...(o.headers||{})}});
async function response(path,o={}){return worker.fetch(req(path,o),env,{})}
async function status(path,o={}){return (await response(path,o)).status}
for(const path of ['/api/payments/provider/select','/api/payments/create-checkout','/api/payments/ai-credit-checkout','/api/payments/service-checkout','/api/services/orders'])assert.equal(await status(path,{method:'POST',body:'{}'}),403,`manager financial mutation should be 403: ${path}`);
assert.equal(await status('/api/remediation/r1/escalate',{method:'POST',body:'{}'}),403,'manager indirect paid remediation should be 403');
sqlite.prepare("UPDATE memberships SET role='reviewer' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
for(const path of ['/api/partner/tasks','/api/notifications/dead-letters/x/resolve','/api/legal-holds/x/release','/api/company-actions/x/advance'])assert.equal(await status(path,{method:'POST',body:'{}'}),403,`reviewer hidden mutation should be 403: ${path}`);
assert.notEqual(await status('/api/ai/advisor',{method:'POST',body:JSON.stringify({mode:'ask',question:'What should I review next?'})}),403,'reviewer AI advisor remains authorized');
assert.notEqual(await status('/api/evidence/integrity/missing/review',{method:'POST',body:JSON.stringify({decision:'approve'})}),403,'reviewer evidence review remains authorized');
sqlite.prepare("UPDATE memberships SET role='auditor' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
assert.equal(await status('/api/evidence/integrity/missing/review',{method:'POST',body:'{}'}),403,'auditor mutation is read-only');
assert.equal(await status('/api/inspection-packs/missing/export',{method:'POST',body:'{}'}),403,'auditor export generation is read-only');
sqlite.prepare("UPDATE memberships SET role='manager' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
assert.equal(await status('/api/account/deletion-request',{method:'POST',body:JSON.stringify({confirmation:'DELETE MY ACCOUNT'})}),403);
sqlite.prepare("UPDATE memberships SET role='owner' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
assert.equal(await status('/api/account/delete-request',{method:'POST',body:'{}'}),410);
assert.equal(await status('/api/account/deletion-request',{method:'POST',body:JSON.stringify({confirmation:'wrong'})}),400);
let r=await response('/api/account/deletion-request',{method:'POST',body:JSON.stringify({confirmation:'DELETE MY ACCOUNT',reason:'Please remove this tenant'})});assert.ok([200,201].includes(r.status));
assert.equal(await status('/api/account/deletion-status'),200);
// Public HTML fails indexing closed when no trusted HTTPS production origin is configured.
const homeHtml=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ASSETS={fetch:async()=>new Response(homeHtml,{status:200,headers:{'content-type':'text/html'}})};
r=await worker.fetch(new Request('https://preview.workers.dev/'),{ASSETS},{});assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
console.log('v78 1.21.20 runtime adversarial: PASS');
