import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {uploadPrivateCandidateAtomically} from '../scripts/upload-private-r2-candidate-atomic.mjs';

const env={
 PRIVATE_BACKUP_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',
 PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID:'test-access-only',
 PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY:'test-secret-only'
};
const bytes=Buffer.from('CREATE TABLE tenants(id TEXT);');
const sha256=createHash('sha256').update(bytes).digest('hex');
const candidate={key:'candidates/123/1/production-d1.sql',bytes,expectedSha256:sha256};
class PutObjectCommand{constructor(input){this.input=input;}}
class GetObjectCommand{constructor(input){this.input=input;}}
const sdk={PutObjectCommand,GetObjectCommand};

test('S3 conditional put is atomic create-only and byte-for-byte readback',async()=>{
 const commands=[];
 const client={send:async command=>{
   commands.push(command);
   if(command instanceof PutObjectCommand)return {ETag:'etag'};
   if(command instanceof GetObjectCommand)return {Body:(async function*(){yield bytes;})()};
   throw Error('unsupported command');
 }};
 const result=await uploadPrivateCandidateAtomically(env,candidate,{sdk,client});
 assert.equal(result.atomicConditionalCreateVerified,true);
 assert.equal(result.privateRoundtripVerified,true);
 assert.equal(result.sha256,sha256);
 assert.equal(commands.length,2);
 assert.ok(commands[0] instanceof PutObjectCommand);
 assert.equal(commands[0].input.Bucket,'bw-compliance-ops-backups');
 assert.equal(commands[0].input.Key,candidate.key);
 assert.equal(commands[0].input.IfNoneMatch,'*');
 assert.equal(commands[0].input.ContentLength,bytes.length);
 assert.ok(commands[1] instanceof GetObjectCommand);
 assert.equal(commands[1].input.Key,candidate.key);
 assert.equal(commands.some(x=>x.constructor.name.includes('Delete')),false);
});

test('S3 provider config pins account endpoint, path style, region and single attempt',async()=>{
 let options,destroyed=false;
 class S3Client{
   constructor(config){options=config;}
   async send(command){
     if(command instanceof PutObjectCommand)return {};
     if(command instanceof GetObjectCommand)return {Body:(async function*(){yield bytes;})()};
     throw Error('unexpected command');
   }
   destroy(){destroyed=true;}
 }
 const result=await uploadPrivateCandidateAtomically(env,candidate,{sdk:{...sdk,S3Client}});
 assert.equal(result.privateRoundtripVerified,true);
 assert.equal(destroyed,true);
 assert.equal(options.region,'auto');
 assert.equal(options.endpoint,'https://ddd23cab31928a4bb3d4998df9b26d1d.r2.cloudflarestorage.com');
 assert.equal(options.forcePathStyle,true);
 assert.equal(options.maxAttempts,1);
 assert.equal(options.credentials.accessKeyId,env.PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID);
 assert.equal(options.credentials.secretAccessKey,env.PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY);
});

test('no provider calls occur with bad key, object or credential scope',async()=>{
 let sends=0;
 const client={send:async()=>{sends++;return {}}};
 const bad=[
   [{...env,PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID:''},candidate],
   [{...env,PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY:''},candidate],
   [{...env,PRIVATE_BACKUP_ACCOUNT_ID:'a'.repeat(32)},candidate],
   [env,{...candidate,key:'../production-d1.sql'}],
   [env,{...candidate,expectedSha256:'0'.repeat(64)}],
   [env,{...candidate,bytes:Buffer.alloc(0)}],
   [env,{...candidate,bytes:'not buffer'}]
 ];
 for(const [e,c] of bad)await assert.rejects(
   uploadPrivateCandidateAtomically(e,c,{sdk,client}),/private_s3_candidate_hold_authority_or_candidate/
 );
 assert.equal(sends,0);
});

test('competing conditional put (412) stops without GET, retry or overwrite',async()=>{
 const commands=[];
 const client={send:async cmd=>{commands.push(cmd);throw Error('PreconditionFailed HTTP 412')}};
 await assert.rejects(uploadPrivateCandidateAtomically(env,candidate,{sdk,client}),
   /private_s3_candidate_hold_exclusive_create_refused_or_unconfirmed/);
 assert.equal(commands.length,1);
 assert.equal(commands[0].input.IfNoneMatch,'*');
});

test('readback corruption or missing body fails closed without second PUT',async()=>{
 for(const badBody of [
   (async function*(){yield Buffer.from('corrupt')})(),
   (async function*(){yield Buffer.alloc(0)})(),
   null
 ]){
   const commands=[];
   const client={send:async command=>{
     commands.push(command);
     return command instanceof GetObjectCommand?{Body:badBody}:{};
   }};
   await assert.rejects(uploadPrivateCandidateAtomically(env,candidate,{sdk,client}),
     /private_s3_candidate_hold_/);
   assert.equal(commands.length,2);
   assert.equal(commands.filter(c=>c instanceof PutObjectCommand).length,1);
 }
});

test('oversized remote readback rejects streaming data and never reports success',async()=>{
 const commands=[];
 const client={send:async command=>{
   commands.push(command);
   return command instanceof GetObjectCommand?
     {Body:(async function*(){yield Buffer.alloc(26*1024*1024);})()}:{};
 }};
 await assert.rejects(uploadPrivateCandidateAtomically(env,candidate,{sdk,client}),
   /private_s3_candidate_hold_readback_oversized/);
 assert.equal(commands.length,2);
});
