import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readPinnedCandidateResponse,VERSIONED_RESTORE,approvalContract,verifyApprovalRecord,executeVersionedImport,verifyVersionedInventory,runVersionedImport} from '../scripts/restore-versioned-candidate.mjs';
const sourceSha='a'.repeat(40);
const record=(login,id)=>({id,user:{login},issue_url:'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/1950',body:'THEBE_VERSIONED_RESTORE_APPROVAL\n'+JSON.stringify(approvalContract(sourceSha))});
const ownerRecord=record('adinosassist-stack',123),independentRecord=record('thusico',456);
test('binary reader bounds streamed bytes and rejects provider errors, short or oversized content',async()=>{
 const bytes=Buffer.alloc(VERSIONED_RESTORE.bytes,1);
 assert.deepEqual(await readPinnedCandidateResponse(new Response(bytes)),bytes);
 for(const r of [new Response('private provider error',{status:403}),new Response('short'),
 new Response(bytes,{headers:{'content-length':'999'}}),new Response(Buffer.alloc(bytes.length+1))])
 await assert.rejects(readPinnedCandidateResponse(r),/versioned_restore_(candidate_mismatch|download_refused)/);
});
test('authenticated review scope rejects wrong author, issue, stale SHA, extra claims and missing retention acceptance',()=>{
 assert.equal(verifyApprovalRecord(independentRecord,'thusico',sourceSha),true);
 for(const r of [{...independentRecord,user:{login:'other'}},{...independentRecord,issue_url:'other'},
 {...independentRecord,body:'approved'},
 {...independentRecord,body:'THEBE_VERSIONED_RESTORE_APPROVAL\n'+JSON.stringify({...approvalContract(sourceSha),sourceSha:'b'.repeat(40)})},
 {...independentRecord,body:'THEBE_VERSIONED_RESTORE_APPROVAL\n'+JSON.stringify({...approvalContract(sourceSha),retentionAndAccessAccepted:false})},
 {...independentRecord,body:'THEBE_VERSIONED_RESTORE_APPROVAL\n'+JSON.stringify({...approvalContract(sourceSha),production:true})}])
 assert.throws(()=>verifyApprovalRecord(r,'thusico',sourceSha),/versioned_restore_approval/);
});
test('missing independent approval prevents all adapter access',async()=>{
 const adapter=new Proxy({}, {get(){assert.fail('no provider access')}});
 await assert.rejects(executeVersionedImport(adapter,{sourceSha,ownerRecord}),/approval_record/);
});
test('nonempty target prevents download/import and bad bytes cannot import',async()=>{
 for(const nonempty of [true,false]){
 let downloads=0,imports=0;
 const a={checkIsolation:async()=>{},query:async()=>[{n:nonempty?1:0}],downloadCandidate:async()=>{downloads++;return Buffer.from('synthetic wrong bytes')},importSql:async()=>imports++};
 await assert.rejects(executeVersionedImport(a,{sourceSha,ownerRecord,independentRecord}),nonempty?/target_not_empty/:/candidate_mismatch/);
 assert.equal(downloads,nonempty?0:1);assert.equal(imports,0);
 }
});
test('provider isolation failure propagates without download or import',async()=>{
 let calls=0;
 await assert.rejects(executeVersionedImport({checkIsolation:async()=>{throw Error('refused')},query:async()=>calls++},{sourceSha,ownerRecord,independentRecord}),/refused/);
 assert.equal(calls,0);
});
test('real SQLite inventory accepts exact rows and rejects missing/extra tables, count drift and FK failures',async()=>{
 for(const mismatch of ['none','extra','count','fk']){
 const db=new DatabaseSync(':memory:');
 try{
 db.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id)); INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1,1);');
 if(mismatch==='extra')db.exec('CREATE TABLE extra(id INTEGER)');
 if(mismatch==='count')db.exec('INSERT INTO parent VALUES(2)');
 if(mismatch==='fk')db.exec('PRAGMA foreign_keys=OFF; INSERT INTO child VALUES(2,999);');
 const query=async s=>db.prepare(s).all();
 const p=verifyVersionedInventory(query,{child:mismatch==='fk'?2:1,parent:1});
 if(mismatch==='none')assert.equal(await p,2);
 else await assert.rejects(p,mismatch==='extra'?/table_set/:mismatch==='count'?/row_counts/:/foreign_keys/);
 await assert.rejects(verifyVersionedInventory(query,{missing:1}),/table_set/);
 }finally{db.close()}
 }
});
test('invalid inventory cannot inject queries',async()=>{
 let calls=0;
 for(const counts of [{},{'bad";DROP TABLE parent':1},{parent:-1},{parent:1.5}])
 await assert.rejects(verifyVersionedInventory(async()=>{calls++;return []},counts),/inventory/);
 assert.equal(calls,0);
});
test('runner refuses ordinary CLI use before network or filesystem transport',async()=>{
 await assert.rejects(runVersionedImport({EXPECTED_SHA:sourceSha}),/authority/);
 await assert.rejects(runVersionedImport({EXPECTED_SHA:'main'}),/revision/);
});
