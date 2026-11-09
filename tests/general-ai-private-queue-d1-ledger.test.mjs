import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createPrivateAiD1NonceLedger} from '../cloudflare/src/general-ai-private-queue-d1-ledger.js';
const namespace='bw-general-ai-private-acceptance-queue', sourceSha='a'.repeat(40), nonce='b'.repeat(32);
const input={namespace,sourceSha,nonce};
function makeDb(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../cloudflare/schema/general-ai-private-queue-ledger-candidate.sql',import.meta.url),'utf8'));
 const db={prepare(query){const stmt=sql.prepare(query);return {bind(...args){return {run:async()=>{const result=stmt.run(...args);return {success:true,meta:{changes:Number(result.changes)}}}}}}}};
 return {sql,db};
}
test('real SQLite unique claim, subsequent duplicate refused, only SHA and digest persisted',async()=>{
 const {sql,db}=makeDb();try{
  const ledger=createPrivateAiD1NonceLedger({db,schemaQualified:true});
  assert.equal(await ledger.claimOnce(input),true);
  assert.equal(await ledger.claimOnce(input),false);
  const rows=sql.prepare('SELECT * FROM ai_private_queue_nonce_claims').all();
  assert.equal(rows.length,1);assert.equal(rows[0].source_sha,sourceSha);
  assert.match(rows[0].claim_hash,/^[a-f0-9]{64}$/);
  assert.equal(rows[0].claim_hash.includes(nonce),false);
 }finally{sql.close()}
});
test('two ledger clients sharing same SQLite database never both claim',async()=>{
 const {sql,db}=makeDb();try{
  const a=createPrivateAiD1NonceLedger({db,schemaQualified:true});
  const b=createPrivateAiD1NonceLedger({db,schemaQualified:true});
  const values=await Promise.all([a.claimOnce(input),b.claimOnce(input)]);
  assert.deepEqual(values.sort(),[false,true]);
 }finally{sql.close()}
});
test('different nonce or SHA makes a distinct digest',async()=>{
 const {sql,db}=makeDb();try{
  const l=createPrivateAiD1NonceLedger({db,schemaQualified:true});
  assert.equal(await l.claimOnce(input),true);
  assert.equal(await l.claimOnce({...input,nonce:'c'.repeat(32)}),true);
  assert.equal(await l.claimOnce({...input,sourceSha:'d'.repeat(40)}),true);
  assert.equal(sql.prepare('SELECT count(*) n FROM ai_private_queue_nonce_claims').get().n,3);
 }finally{sql.close()}
});
test('refuse unreviewed schema, scope mismatches or malformed IDs before any write',async()=>{
 const {sql,db}=makeDb();try{
  assert.throws(()=>createPrivateAiD1NonceLedger({db}),/ai_nonce_schema_qualification_required/);
  const l=createPrivateAiD1NonceLedger({db,schemaQualified:true});
  for(const bad of [{...input,nonce:'unsafe'}, {...input,namespace:'production'}, {...input,sourceSha:'nope'}])
   await assert.rejects(()=>l.claimOnce(bad),/ai_nonce_invalid_scope/);
  assert.equal(sql.prepare('SELECT count(*) n FROM ai_private_queue_nonce_claims').get().n,0);
 }finally{sql.close()}
});
test('D1 errors and ambiguous write metadata fail closed',async()=>{
 const db={prepare:()=>({bind:()=>({run:async()=>({success:true,meta:{changes:undefined}})})})};
 const l=createPrivateAiD1NonceLedger({db,schemaQualified:true});
 await assert.rejects(()=>l.claimOnce(input),/ai_nonce_write_unverified/);
 const dbFail={prepare:()=>({bind:()=>({run:async()=>{throw Error('backend_unavailable')}})})};
 await assert.rejects(()=>createPrivateAiD1NonceLedger({db:dbFail,schemaQualified:true}).claimOnce(input),/backend_unavailable/);
});
