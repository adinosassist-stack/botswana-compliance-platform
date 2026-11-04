// Scheduled-only R2 candidate put with S3 atomic create semantics.
// Cloudflare REST PutObject does NOT document If-None-Match for writes; use
// R2's documented S3 PutObject If-None-Match:* conditional atomic write.
// This module never deletes, overwrites, retries or logs private SQL bytes.
import {createHash} from 'node:crypto';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const BUCKET='bw-compliance-ops-backups';
const KEY=/^candidates\/[1-9][0-9]*\/[1-9][0-9]*\/production-d1\.sql$/;
const LIMIT=25*1024*1024;
const fail=x=>{throw Error('private_s3_candidate_hold_'+x)};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function boundedR2Body(body){
 if(!body||typeof body[Symbol.asyncIterator]!=='function')fail('readback_unavailable');
 const parts=[];let size=0;
 try{
   for await(const chunk of body){
     const item=Buffer.from(chunk);
     size+=item.length;
     if(size>LIMIT)fail('readback_oversized');
     parts.push(item);
   }
 }catch(error){
   if(String(error?.message||'').startsWith('private_s3_candidate_hold_'))throw error;
   fail('readback_transport');
 }
 if(size===0)fail('readback_empty');
 return Buffer.concat(parts,size);
}
export async function uploadPrivateCandidateAtomically(
  env,{key,bytes,expectedSha256},
  {sdk,client}={}
){
 if(env?.PRIVATE_BACKUP_ACCOUNT_ID!==ACCOUNT||
    typeof env.PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID!=='string'||
    !env.PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID.trim()||
    typeof env.PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY!=='string'||
    !env.PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY.trim()||
    typeof key!=='string'||!KEY.test(key)||
    !Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>LIMIT||
    !/^[a-f0-9]{64}$/.test(expectedSha256||'')||sha(bytes)!==expectedSha256)
   fail('authority_or_candidate');
 const lib=sdk||await import('@aws-sdk/client-s3');
 if(typeof lib.PutObjectCommand!=='function'||typeof lib.GetObjectCommand!=='function'||
    (!client&&typeof lib.S3Client!=='function'))fail('sdk_unavailable');
 const ownClient=!client;
 const s3=client||new lib.S3Client({region:'auto',
   endpoint:`https://${ACCOUNT}.r2.cloudflarestorage.com`,
   credentials:{
     accessKeyId:env.PRIVATE_BACKUP_SCHEDULE_R2_ACCESS_KEY_ID,
     secretAccessKey:env.PRIVATE_BACKUP_SCHEDULE_R2_SECRET_ACCESS_KEY
   },
   forcePathStyle:true,maxAttempts:1
 });
 try{
   // This condition is checked atomically by R2 at object-commit time.
   // HTTP 412 / PreconditionFailed MUST stop, never overwrite/retry.
   try{await s3.send(new lib.PutObjectCommand({
     Bucket:BUCKET,Key:key,Body:bytes,ContentType:'application/sql',
     ContentLength:bytes.length,IfNoneMatch:'*'
   }));}
   catch{fail('exclusive_create_refused_or_unconfirmed')}
   let response;
   try{response=await s3.send(new lib.GetObjectCommand({Bucket:BUCKET,Key:key}));}
   catch{fail('readback_refused')}
   const roundtrip=await boundedR2Body(response?.Body);
   if(roundtrip.length!==bytes.length||sha(roundtrip)!==expectedSha256)fail('readback_mismatch');
   return Object.freeze({atomicConditionalCreateVerified:true,
     privateRoundtripVerified:true,bytes:roundtrip.length,sha256:expectedSha256});
 }finally{
   if(ownClient)await s3.destroy();
 }
}
