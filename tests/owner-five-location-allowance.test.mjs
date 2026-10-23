import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyFiveLocationAllowance,allowanceFailureMessage} from '../scripts/owner-five-location-allowance.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 db.exec(`INSERT INTO tenants(id,name) VALUES('target','Lovely Group'),('other','Other');
 INSERT INTO users(id,email) VALUES('owner','adinosassist@gmail.com'),('other','other@example.test');
 INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('target','owner','owner','active'),('other','other','owner','active');
 INSERT INTO subscriptions(tenant_id,plan,status) VALUES('target','business','trialing');
 INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES('business','operating_locations',1,2);
 INSERT INTO operating_locations(id,tenant_id,name,active) VALUES('a','target','One',1),('b','target','Two',1);
 INSERT INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,reason) VALUES('target','employees',1,10,'unchanged'),('other','operating_locations',1,2,'unchanged');`);
 const query=async(sql,params=[])=>db.prepare(sql).all(...params).map(x=>({...x}));
 return {db,query};
}
test('inspection performs no writes',async()=>{
 const {db,query}=fixture();const before=db.prepare('SELECT total_changes() n').get().n;
 const result=await applyFiveLocationAllowance(query);assert.equal(result.requestedLimit,5);assert.equal(result.activeLocations,2);assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
});
test('apply changes only the selected location allowance and records intent and verification',async()=>{
 const {db,query}=fixture();await applyFiveLocationAllowance(query,{apply:true,runId:'123'});
 const rows=await query('SELECT tenant_id,feature_key,limit_value FROM entitlement_overrides ORDER BY tenant_id,feature_key');
 assert.deepEqual(rows,[{tenant_id:'other',feature_key:'operating_locations',limit_value:2},{tenant_id:'target',feature_key:'employees',limit_value:10},{tenant_id:'target',feature_key:'operating_locations',limit_value:5}]);
 assert.equal((await query('SELECT * FROM audit_events')).length,2);
 await applyFiveLocationAllowance(query,{apply:true,runId:'124'});assert.equal((await query("SELECT * FROM entitlement_overrides WHERE tenant_id='target' AND feature_key='operating_locations'")).length,1);
});
test('missing, ambiguous or non-owner workspace refuses all writes',async()=>{
 for(const mutation of ["UPDATE memberships SET role='manager' WHERE tenant_id='target'","UPDATE tenants SET name='Renamed' WHERE id='target'","INSERT INTO tenants(id,name) VALUES('duplicate','Lovely Group'); INSERT INTO memberships(tenant_id,user_id,role) VALUES('duplicate','owner','owner')"]){
  const {db,query}=fixture();db.exec(mutation);await assert.rejects(applyFiveLocationAllowance(query,{apply:true,runId:'1'}),/exactly one/);assert.equal((await query('SELECT * FROM audit_events')).length,0);
 }
});
test('refuses to reduce a larger or unlimited allowance or enable a disabled override',async()=>{
 for(const [enabled,limit] of [[1,10],[1,null],[0,2]]){
  const {db,query}=fixture();db.prepare("INSERT INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value) VALUES('target','operating_locations',?,?)").run(enabled,limit);
  await assert.rejects(applyFiveLocationAllowance(query,{apply:true,runId:'1'}),/Existing override/);assert.equal((await query('SELECT * FROM audit_events')).length,0);
 }
});
test('concurrent override cannot be overwritten and is not marked verified',async()=>{
 const {query}=fixture();const racing=async(sql,params)=>{if(sql.startsWith('INSERT INTO entitlement_overrides('))await query("INSERT INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,reason) VALUES('target','operating_locations',1,10,'concurrent')");return query(sql,params)};
 await assert.rejects(applyFiveLocationAllowance(racing,{apply:true,runId:'1'}),/not verified/);
 assert.equal((await query("SELECT limit_value FROM entitlement_overrides WHERE tenant_id='target' AND feature_key='operating_locations'"))[0].limit_value,10);
 assert.equal((await query("SELECT * FROM audit_events WHERE event_type='OWNER_LOCATION_ALLOWANCE_VERIFIED'")).length,0);
});
test('workflow requires explicit owner dispatch, exact current main and production environment',()=>{
 const s=readFileSync(new URL('../.github/workflows/owner-five-location-allowance.yml',import.meta.url),'utf8');
 for(const text of ['workflow_dispatch:','environment: production',"GITHUB_ACTOR\" == 'adinosassist-stack'",'refs/remotes/origin/main','default: INSPECT_ONLY','persist-credentials: false'])assert(s.includes(text));
 assert(!s.includes('pull_request_target'));assert(!s.includes('contents: write'));
});

test('diagnostics expose only allowlisted failure reasons, never raw credentials or responses',()=>{
 assert.equal(allowanceFailureMessage(new Error('Expected exactly one matching active owner workspace; refusing changes')),'Expected exactly one matching active owner workspace; refusing changes');
 assert.equal(allowanceFailureMessage(new Error('Cloudflare D1 request failed HTTP 403')),'Cloudflare D1 request failed HTTP 403');
 assert(!allowanceFailureMessage(new Error('token=private-secret database-response')).includes('private-secret'));
});

test('real Node assertion details retain the allowlisted reason without leaking comparison data',async()=>{
 let failure;try{await applyFiveLocationAllowance(async()=>[])}catch(error){failure=error}
 assert(failure);assert.match(failure.message,/0 !== 1/);
 assert.equal(allowanceFailureMessage(failure),'Expected exactly one matching active owner workspace; refusing changes');
});
