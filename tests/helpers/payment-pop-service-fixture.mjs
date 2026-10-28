import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export const popFixtureId='11111111-1111-4111-8111-111111111111';
export function popSqliteAdapter(sql){
 return {prepare(query){let values=[];const execute=()=>({success:true,meta:{changes:Number(sql.prepare(query).run(...values).changes)}});return {bind(...p){values=p;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){return execute()},__execute:execute}},async batch(statements){
  sql.exec('BEGIN');try{const results=statements.map(s=>s.__execute());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}
 }};
}
export function popServiceFixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloudflare/schema.sql','utf8'));sql.exec(readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8'));
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,'Local POP fixture')").run(popFixtureId);
 sql.prepare("INSERT INTO users(id,email) VALUES(?,'pop-fixture@example.invalid')").run(popFixtureId);
 sql.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run(popFixtureId,popFixtureId);
 sql.prepare("INSERT INTO payment_orders(id,tenant_id,order_type,provider,status,amount_bwp,idempotency_key) VALUES(?,?,'subscription','manual_bank','pending',349,'pop-fixture-order')").run(popFixtureId,popFixtureId);
 const objects=new Map();let puts=0,deletes=0;
 const env={POP_UPLOAD_STAGING_ENABLED:'true',DB:popSqliteAdapter(sql),EVIDENCE:{async put(key,bytes){puts++;if(objects.has(key))return null;objects.set(key,bytes);return {etag:'local-object'}},async delete(key){deletes++;objects.delete(key)}}};
 return {sql,env,objects,session:{tenantId:popFixtureId,role:'owner',userId:popFixtureId},counts:()=>({puts,deletes}),close:()=>sql.close()};
}
