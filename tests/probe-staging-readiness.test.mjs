import test from 'node:test';
import assert from 'node:assert/strict';
import {probeStagingReadiness} from '../scripts/probe-staging-readiness.mjs';
test('read-only staging probe never exposes rows or SQL',async()=>{
 const queries=[];
 const db={prepare(sql){queries.push(sql);return {first:async()=>({ok:1})}}};
 const result=await probeStagingReadiness(db);
 assert.equal(result.ok,true);
 assert.equal(result.steps.length,17);
 assert.ok(queries.every(q=>/^SELECT /i.test(q)));
 assert.doesNotMatch(JSON.stringify(result),/SELECT|processing_token|session_generation/);
});
test('missing schema item fails closed and skips later probes',async()=>{
 let calls=0;
 const db={prepare(){return {first:async()=>{calls++;if(calls===3)throw Error('private error');return {ok:1}}}}};
 const result=await probeStagingReadiness(db);
 assert.equal(result.ok,false);assert.equal(result.steps.length,3);
 assert.doesNotMatch(JSON.stringify(result),/private error/);
});
test('absent index fails closed',async()=>{
 const db={prepare(sql){return {first:async()=>sql.includes("name='daily_report_revisions_report_revision_uq'")?null:{ok:1}}}};
 const result=await probeStagingReadiness(db);
 assert.equal(result.ok,false);assert.equal(result.steps.at(-1).name,'revision_index');
});
test('missing D1 binding refuses execution',async()=>{
 await assert.rejects(probeStagingReadiness(null),/staging_d1_binding_required/);
});

test('isolated staging probes track every production core schema readiness statement',async()=>{
 const {readFileSync}=await import('node:fs');
 const worker=readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
 const start=worker.indexOf('async function currentSchemaReady(env)');
 const end=worker.indexOf('function deploymentReadiness(env)',start);
 assert.ok(start>=0&&end>start,'production schema gate must be present');
 const gate=worker.slice(start,end);
 const marker='env.DB.prepare("';
 const probes=gate.split(marker).slice(1).map(part=>part.split('")',1)[0]);
 assert.ok(probes.every(sql=>sql.startsWith('SELECT ')&&!sql.includes('"')),'production probes must be literal SELECT statements');
 assert.equal(probes.length,16,'production schema probe count changed; review isolated staging parity');
 const queries=[];
 const db={prepare(sql){queries.push(sql);return {first:async()=>({ok:1})}}};
 const report=await probeStagingReadiness(db);
 assert.equal(report.ok,true);
 assert.equal(queries.length,17);
 assert.equal(queries[0],'SELECT 1 AS ok');
 assert.deepEqual(queries.slice(1),probes,'isolated staging must match the exact ordered production D1 schema checks');
});
