import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fail=(code)=>{throw Error('pop_preflight_'+code)};
const paths=['cloudflare/migrations/070_payment_pop_documents.sql','cloudflare/migrations/071_payment_pop_runtime_compat.sql'];
const src=paths.map(p=>readFileSync(p,'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const required070=['CREATE TABLE IF NOT EXISTS payment_pop_documents','FOREIGN KEY(tenant_id) REFERENCES tenants(id)','FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id)','FOREIGN KEY(submission_id) REFERENCES manual_payment_submissions(id)'];
for(const s of required070)if(!src[0].includes(s))fail('070_drift');
const columns=['content_sha256','object_etag','scan_request_id','scan_requested_at','scan_request_expires_at','scan_result_hash','scan_result_body','scan_result_signature','scanner_provider','scanned_at','last_owner_read_at','storage_deleted_at'];
for(const name of columns)if(!src[1].includes('ALTER TABLE payment_pop_documents ADD COLUMN '+name+' '))fail('071_column_drift');
if(!src[1].includes('CREATE TABLE payment_pop_upload_requests (')||!src[1].includes('CREATE INDEX payment_pop_upload_requests_tenant_idx'))fail('071_table_drift');
// Pin the reviewed additive SQL bytes instead of classifying individual words:
// ON DELETE CASCADE / SET NULL are foreign-key policies, not DELETE statements.
// Any source change (including comments) requires independent checksum review.
// This offline source check never grants migration execution authority.
const reviewedHashes=[
 'f52f9c8e429670cf2e5956b7610e7f1e9b8594e946470ee331ecf06f979c9261',
 '24cb1d9e42ef6edaaf04ba53f3945f5112cc61b0c3d52010480be4603c38dc3c'
];
for(const [i,s] of src.entries())if(hash(s)!==reviewedHashes[i])fail('source_mismatch_'+(i+70));
const report={kind:'pop070_071_static_preflight',mode:'offline_static_only',migration_070_sha256:hash(src[0]),migration_071_sha256:hash(src[1]),ordered_paths:paths,expected_prerequisites:['tenants','payment_orders','manual_payment_submissions'],required_additive_071_columns:columns.length,production_target_contacted:false,backup_confirmed:false,production_write_authorized:false,mutation_performed:false};
console.log(JSON.stringify(report));
