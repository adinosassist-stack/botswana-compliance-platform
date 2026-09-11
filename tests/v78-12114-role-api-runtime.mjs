import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';
class St{constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}first(){const r=this.db.prepare(this.sql).get(...this.args);return r?{...r}:null}all(){return {results:this.db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}}
class D1{constructor(db){this.db=db}prepare(sql){return new St(this.db,sql)}batch(ss){this.db.exec('BEGIN IMMEDIATE');try{const r=ss.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));const DB=new D1(sqlite);
const secret='v78-12114-session-secret',raw='session-token',csrf='csrf-token',hash=createHmac('sha256',secret).update(raw).digest('hex');
sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('t1','Tenant One');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u1','reviewer@example.com','Reviewer');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u1','reviewer','active');
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(hash,'u1','t1','reviewer',csrf);
sqlite.prepare('INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)').run('t1','business','active');
for(const feature of ['core_compliance','inspection_simulator','control_assurance','evidence_health','regulatory_change_control','institutional_passport'])sqlite.prepare("INSERT INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES(?,?,1,NULL) ON CONFLICT(plan,feature_key) DO UPDATE SET enabled=1").run('business',feature);
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:'audit-secret',PUBLIC_ORIGIN:'https://app.example'};
const req=(path,o={})=>new Request(`https://app.example${path}`,{...o,headers:{cookie:`__Host-bw_session=${raw}`,'x-csrf-token':csrf,'content-type':'application/json',...(o.headers||{})}});
async function status(path,o){return (await worker.fetch(req(path,o),env,{})).status}
const reviewerAllowed=['/api/state','/api/evidence','/api/audit','/api/audit/integrity','/api/statutory-calendar','/api/obligations','/api/regulatory/sources','/api/regulatory/rules','/api/regulatory/conflicts','/api/regulatory/impacts','/api/regulatory/applicability','/api/regulatory-change-cases','/api/remediation','/api/inspection-scenarios','/api/inspection-simulations','/api/inspection-packs','/api/control-center','/api/evidence-health','/api/passport'];
for(const path of reviewerAllowed){const s=await status(path);assert.notEqual(s,403,`reviewer allowed read unexpectedly forbidden: ${path}`)}
const forbiddenReads=['/api/tenders','/api/cipa/registry?companyId=c1','/api/ai/credits','/api/ai/credits/orders','/api/ai/cost-control','/api/ai/usage','/api/services/orders','/api/workflow-rules','/api/workflows','/api/partner/clients','/api/partner/invites','/api/notifications','/api/notification-channels/whatsapp','/api/compliance-schedules','/api/account/export','/api/legal-holds','/api/business-risk-events'];
for(const path of forbiddenReads)assert.equal(await status(path),403,`reviewer read should be forbidden: ${path}`);
assert.equal(await status('/api/business-risk-events/recalculate',{method:'POST',body:'{}'}),403);
assert.equal(await status('/api/control-center/recalculate',{method:'POST',body:'{}'}),403);
let r=await worker.fetch(req('/api/ai/credits/use',{method:'POST',body:JSON.stringify({feature:'advisor'})}),env,{});assert.equal(r.status,403);
// Reviewer may use the grounded AI advisor, subject to normal credits/provider behavior; the authorization layer must not return 403.
r=await worker.fetch(req('/api/ai/advisor',{method:'POST',body:JSON.stringify({mode:'ask',question:'What should I review next?'})}),env,{});assert.notEqual(r.status,403);
// Auditor retains evidence/audit/inspection/control/passport reads, but not regulatory-intelligence reads or AI execution.
sqlite.prepare("UPDATE memberships SET role='auditor' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
for(const path of ['/api/state','/api/evidence','/api/audit','/api/audit/integrity','/api/statutory-calendar','/api/obligations','/api/inspection-scenarios','/api/inspection-simulations','/api/inspection-packs','/api/control-center','/api/evidence-health','/api/passport'])assert.notEqual(await status(path),403,`auditor allowed read unexpectedly forbidden: ${path}`);
for(const path of ['/api/regulatory/sources','/api/regulatory/impacts','/api/tenders','/api/cipa/registry?companyId=c1','/api/ai/cost-control','/api/services/orders','/api/account/export'])assert.equal(await status(path),403,`auditor read should be forbidden: ${path}`);
assert.equal(await status('/api/ai/advisor',{method:'POST',body:JSON.stringify({mode:'ask',question:'Review this workspace'})}),403);
// Manager may read operational AI controls but cannot export the entire tenant account bundle.
sqlite.prepare("UPDATE memberships SET role='manager' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
assert.equal(await status('/api/account/delete-request',{method:'POST',body:'{}'}),403);
assert.equal(await status('/api/account/deletion-status'),403);
assert.notEqual(await status('/api/ai/cost-control'),403);
assert.equal(await status('/api/account/export'),403);
// Owner retains account export.
sqlite.prepare("UPDATE memberships SET role='owner' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
assert.equal(await status('/api/account/delete-request',{method:'POST',body:'{}'}),410);
assert.notEqual(await status('/api/account/deletion-status'),403);
assert.notEqual(await status('/api/account/export'),403);
console.log('v78 1.21.20 role/API runtime adversarial: PASS');
