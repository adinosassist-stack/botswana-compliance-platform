import assert from "node:assert/strict";
const QUEUE="bw-general-ai-private-acceptance-queue";
const WORKER="bw-general-ai-private-queue-acceptance";
const DB="71e2d394-7dec-4878-bdc8-afe8f73cf541";
const FLAGS=["PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED","PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED","PRIVATE_AI_LEDGER_ISOLATION_VERIFIED"];
/** Read-only inventory validation. This is not live Queue qualification or authorization. */
export function verifyInertPrivateQueueInventory({queues,worker,d1}){
 assert.ok(Array.isArray(queues),"queue inventory required");
 const matching=queues.filter(q=>q.queue_name===QUEUE);
 assert.equal(matching.length,1,"private queue identity must be unique");
 const queue=matching[0];
 assert.equal(queue.producers_total_count,0,"unknown Queue producer detected");
 assert.deepEqual(queue.producers??[],[],"Queue producers forbidden");
 assert.equal(queue.consumers_total_count,1,"exactly one private consumer required");
 assert.equal(queue.consumers?.length,1);
 const consumer=queue.consumers[0];
 assert.equal(consumer.script,WORKER);
 assert.equal(consumer.type,"worker");
 assert.equal(consumer.settings?.batch_size,1);
 assert.equal(consumer.settings?.max_retries,0);
 assert.equal(consumer.settings?.max_concurrency,1);
 assert.ok(Array.isArray(worker?.bindings),"Worker bindings required");
 const byName=name=>{const matches=worker.bindings.filter(b=>b.name===name);assert.equal(matches.length,1,"binding missing or duplicated: "+name);return matches[0];};
 for(const name of FLAGS){const flag=byName(name);assert.equal(flag.type,"plain_text");assert.equal(flag.text,"false",name+" must remain disabled");}
 const db=byName("PRIVATE_AI_NONCE_DB");
 assert.equal(db.type,"d1");assert.equal(db.database_id??db.id,DB,"isolated D1 identity mismatch");
 const service=byName("STAGING_AI");
 assert.equal(service.type,"service");assert.equal(service.service,"bw-general-ai-staging");
 // A service binding's 'production' environment label is not proof of isolation.
 // Require independent source/route/environment attestation before live execution.
 assert.ok(Array.isArray(d1) && d1.length===1 && d1[0]?.success===true,"D1 schema query must succeed");
 const rows=d1[0].results??[];
 assert.equal(rows.length,1,"nonce schema missing or ambiguous");
 assert.equal(rows[0].name,"ai_private_queue_nonce_claims");
 assert.equal(rows[0].type,"table");
 assert.match(rows[0].sql??"",/claim_hash\s+TEXT\s+PRIMARY KEY/i);
 assert.match(rows[0].sql??"",/source_sha\s+TEXT\s+NOT NULL/i);
 assert.equal(d1[0].meta?.changes,0,"read-only schema query must not mutate D1");
 assert.equal(d1[0].meta?.changed_db,false);
 return Object.freeze({scope:"READ_ONLY_INVENTORY",queue:QUEUE,worker:WORKER,nonceDb:DB,flagsDisabled:true,producerCount:0,consumerCount:1,serviceBindingEnvironment:service.environment??null,serviceIsolationAttested:false,liveDeliveryVerified:false,productionAiEnabled:false});
}
