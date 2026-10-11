import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  first(){return this.db.prepare(this.sql).get(...this.args)||null}
  all(){return {results:this.db.prepare(this.sql).all(...this.args)}}
  run(){const result=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(result.changes)}}}
}
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
const DB={prepare:sql=>new Statement(sqlite,sql),batch:statements=>statements.map(statement=>statement.run())};
const origin='https://app.example',secret='priority-routing-test-secret';
sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('t1','Priority fixture');
for(const role of ['owner','manager','reviewer','auditor']){
  sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run(role,`${role}@example.com`,role);
  sqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1',?,?,'active')").run(role,role);
  const hash=createHmac('sha256',secret).update(`${role}-session`).digest('hex');
  sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,'t1',?,?,datetime('now','+1 day'))").run(hash,role,role,`${role}-csrf`);
}
const env={DB,SESSION_SECRET:secret,PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin};
async function queue({role='owner',csrf=true,requestOrigin=origin,signals=[],method='POST',path='/api/ai/operator/queue',body}={}){
  const headers={origin:requestOrigin,'content-type':'application/json'};
  if(role)headers.cookie=`__Host-bw_session=${role}-session`;
  if(csrf&&role)headers['x-csrf-token']=`${role}-csrf`;
  const response=await worker.fetch(new Request(origin+path,{method,headers,...(method==='GET'?{}:{body:body??JSON.stringify({signals,tenantId:'other-tenant',actorRole:'owner'})})}),env,{});
  return {status:response.status,body:await response.json()};
}
for(const role of ['owner','manager']){
  const out=await queue({role,signals:[{id:'fixture-1',domain:'finance',severity:'high',title:'Review recorded finance evidence'}]});
  assert.equal(out.status,200,JSON.stringify(out.body));
  assert.equal(out.body.items.length,1);
  assert.equal(out.body.items[0].externalSideEffect,false);
  assert.equal(out.body.items[0].outcome.status,'not_recorded');
}
assert.equal((await queue()).body.items.length,0);
for(const role of ['reviewer','auditor'])assert.equal((await queue({role})).status,403,'client role claims cannot override the authenticated membership');
assert.equal((await queue({role:null})).status,401);
assert.equal((await queue({csrf:false})).body.error,'csrf_failed');
assert.equal((await queue({requestOrigin:'https://other.example'})).body.error,'origin_failed');
assert.equal((await queue({signals:Array.from({length:101},()=>({domain:'finance'}))})).status,400);
assert.equal((await queue({body:'{"signals":'})).status,400);
assert.equal((await queue({body:JSON.stringify({signals:[],padding:'x'.repeat(33000)})})).status,413);
assert.equal((await queue({path:'/api/ai/operator/queue/execute'})).status,404,'queue routing cannot expose execution');
assert.equal((await queue({method:'GET'})).status,404);
for(const table of ['notification_outbox','compliance_obligations','agentic_runs','partner_tasks']){
  assert.equal(Number(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n),0,`${table} must remain untouched`);
}
console.log('Owner priority queue Worker routing, auth, CSRF, role, body bounds and no execution: PASS');
