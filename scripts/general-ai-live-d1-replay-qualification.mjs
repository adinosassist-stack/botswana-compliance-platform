import {createHash,randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
const account='ddd23cab31928a4bb3d4998df9b26d1d';
const db='71e2d394-7dec-4878-bdc8-afe8f73cf541';
const source=process.env.GITHUB_SHA;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{40}$/.test(source||'')||!token)throw Error('qualification_source_or_credential_missing');
const namespace='bw-general-ai-private-acceptance-queue';
const nonce=randomBytes(16).toString('hex');
const digest=createHash('sha256').update(namespace+'\n'+source+'\n'+nonce).digest('hex');
async function query(sql,params=[]){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});
 const body=await response.json();
 if(!response.ok||!body.success||!body.result?.[0]?.success)throw Error('staging_d1_query_failed_'+response.status);
 return body.result[0].results||[];
}
const schema=await query("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_private_queue_nonce_claims'");
if(schema.length!==1||!schema[0].sql.includes('claim_hash TEXT PRIMARY KEY'))throw Error('staging_d1_schema_unqualified');
const before=await query('SELECT COUNT(*) AS n FROM ai_private_queue_nonce_claims WHERE claim_hash = ?', [digest]);
if(before.length!==1||Number(before[0].n)!==0)throw Error('unexpected_existing_nonce');
const first=await query('INSERT OR IGNORE INTO ai_private_queue_nonce_claims (claim_hash,source_sha) VALUES (?,?) RETURNING claim_hash',[digest,source]);
const second=await query('INSERT OR IGNORE INTO ai_private_queue_nonce_claims (claim_hash,source_sha) VALUES (?,?) RETURNING claim_hash',[digest,source]);
const after=await query('SELECT COUNT(*) AS n FROM ai_private_queue_nonce_claims WHERE claim_hash = ? AND source_sha = ?',[digest,source]);
if(first.length!==1||first[0].claim_hash!==digest||second.length!==0||after.length!==1||Number(after[0].n)!==1)throw Error('live_d1_replay_rejection_failed');
mkdirSync('private-queue-live-evidence',{recursive:true});
writeFileSync('private-queue-live-evidence/result.json',JSON.stringify({source_sha:source,staging_database_id:db,staging_only:true,schema_verified:true,first_claim_accepted:true,duplicate_claim_rejected:true,stored_claims_for_test:1,consumer_activation:false,production_unchanged:true,limitations:'Tests isolated staging D1 duplicate claims only; not live Queue delivery or broader ledger isolation.'},null,2)+'\n');
console.log('Live staging D1 duplicate claim rejected; consumer remains disabled.');
