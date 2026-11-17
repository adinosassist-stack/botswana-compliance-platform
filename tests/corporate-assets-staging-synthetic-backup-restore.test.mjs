/** Offline-only Corporate Assets D1 backup and recovery rehearsal.
 * Uses checked-in canonical SQL, synthetic identities and local SQLite only.
 * Never connects to Cloudflare, uses real credentials, or authorizes staging writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {stableAuditJson} from '../cloudflare/src/audit-lineage-writer.js';
import {authenticateWorkspaceSession,verifyAuditChainForTests} from '../cloudflare/src/worker.js';
import {handleCorporateAssets} from '../cloudflare/src/corporate-assets.js';
import {createCorporateAssetsStagingEntry} from '../cloudflare/src/corporate-assets-staging-entry.js';
import {corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';
import {corporateAssetsStagingMarkerSql,renderCorporateAssetsStagingConfig} from '../scripts/render-corporate-assets-staging-config.mjs';

const D1='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const PROD='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const SHA='a'.repeat(40);
const MARKER_ENV={ASSETS_STAGING_D1_ID:D1,PRODUCTION_D1_DATABASE_ID:PROD,ASSETS_STAGING_SOURCE_SHA:SHA};
const A='synthetic-tenant-a',B='synthetic-tenant-b';
const USER='synthetic-owner-a';
const ASSET_A='11111111-1111-4111-8111-111111111111';
const ASSET_B='22222222-2222-4222-8222-222222222222';
const SERVICE='33333333-3333-4333-8333-333333333333';
const AUDIT_SECRET='synthetic-assets-audit-key-not-real-01234567890123456789';
const SESSION_SECRET='synthetic-assets-session-key-not-real-01234567890123456789';
const SESSION_TOKEN='synthetic-assets-restore-cookie';
const data={
 canonical:readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'),
 lineage:readFileSync(new URL('../cloudflare/migrations/004_v56_audit_lineage.sql',import.meta.url),'utf8'),
 assets:readFileSync(new URL('../cloudflare/schema/corporate-assets.sql',import.meta.url),'utf8')
};

function tableDDL(source,name){
 const re=new RegExp('CREATE TABLE(?: IF NOT EXISTS)?\\s+'+name+'\\s*\\([\\s\\S]*?\\n\\);','i');
 const found=source.match(re);
 assert.ok(found,'missing reviewed DDL: '+name);
 return found[0];
}
function createSchema(db){
 db.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['tenants','users','memberships','auth_rate_limits','sessions','audit_events'])
  db.exec(tableDDL(data.canonical,name));
 const alterations=data.lineage.match(/^ALTER TABLE audit_events ADD COLUMN [^;]+;$/gm)||[];
 assert.equal(alterations.length,5,'the canonical audit migration has changed');
 for(const alter of alterations)db.exec(alter);
 for(const name of ['audit_chain_state','audit_write_failures','audit_integrity_checks'])
  db.exec(tableDDL(data.lineage,name));
 db.exec(data.assets);
 db.exec(corporateAssetsStagingMarkerSql(MARKER_ENV));
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}
function hmac(secret,value){return createHmac('sha256',secret).update(value).digest('hex')}
function appendSyntheticAudit(db,{tenantId,seq,eventType,entityId,eventData,actorUserId=USER,prevHash='GENESIS'}){
 const occurredAt='2026-11-16T12:00:00.000Z';
 const entityType='corporate_asset',integrityVersion=1;
 const input=stableAuditJson({tenantId,seq,actorUserId,eventType,entityType,entityId,
  eventData,occurredAt,prevHash,integrityVersion});
 const hash=hmac(AUDIT_SECRET,input);
 db.prepare('INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data,occurred_at,tenant_seq,prev_hash,event_hash,integrity_version,write_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(tenantId,actorUserId,eventType,entityType,entityId,stableAuditJson(eventData),
   occurredAt,seq,prevHash,hash,integrityVersion,'server');
 db.prepare('INSERT INTO audit_chain_state(tenant_id,last_hash,event_count) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET last_hash=excluded.last_hash,event_count=excluded.event_count')
  .run(tenantId,hash,seq);
 return hash;
}
function seed(db){
 for(const [id,name] of [[A,'Synthetic Company A'],[B,'Synthetic Company B']])
  db.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(id,name);
 db.prepare('INSERT INTO users(id,email,display_name,session_generation) VALUES(?,?,?,?)')
  .run(USER,'synthetic-owner@example.invalid','Synthetic Owner',0);
 db.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)')
  .run(A,USER,'owner','active');
 db.prepare('INSERT INTO sessions(token_hash,public_id,user_id,tenant_id,role,session_generation,csrf_token,expires_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(hmac(SESSION_SECRET,SESSION_TOKEN),'synthetic-session',USER,A,'owner',0,'synthetic-csrf','2099-01-01 00:00:00','2099-01-01 00:00:00');
 for(const [id,tenant,name] of [[ASSET_A,A,'Synthetic water pump'],[ASSET_B,B,'Synthetic office laptop']])
  db.prepare('INSERT INTO corporate_assets(id,tenant_id,name,category,branch,serial,custodian,acquisition_date,acquisition_cost_minor,book_value_minor,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run(id,tenant,name,id===ASSET_A?'machinery':'it','Synthetic branch','','','2026-01-01',200000,150000,'active');
 db.prepare('INSERT INTO corporate_asset_services(id,tenant_id,asset_id,kind,serviced_on,due_on,cost_minor,provider,description) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(SERVICE,A,ASSET_A,'service','2026-11-01','2027-02-01',5000,'Synthetic provider','Synthetic scheduled maintenance');
 const first=appendSyntheticAudit(db,{tenantId:A,seq:1,eventType:'CORPORATE_ASSET_CREATED',
  entityId:ASSET_A,eventData:{id:ASSET_A,kind:'synthetic-asset'}});
 appendSyntheticAudit(db,{tenantId:A,seq:2,eventType:'CORPORATE_ASSET_SERVICE_RECORDED',
  entityId:ASSET_A,eventData:{id:SERVICE,assetId:ASSET_A},prevHash:first});
 appendSyntheticAudit(db,{tenantId:B,seq:1,eventType:'CORPORATE_ASSET_CREATED',
  entityId:ASSET_B,eventData:{id:ASSET_B},actorUserId:null});
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}
function wrap(db,{auditReceiptWrites=false}={}){
 const calls=[];
 function operations(sql,args=[]){
  const isRead=/^\s*(SELECT|PRAGMA)\b/i.test(sql);
  const isAuditReceipt=auditReceiptWrites&&/^\s*INSERT INTO audit_integrity_checks\(/i.test(sql);
  if(!isRead&&!isAuditReceipt)throw Error('unapproved_offline_sql_operation');
  calls.push({kind:isRead?'read':'synthetic_audit_receipt',sql});
  const statement=db.prepare(sql);
  return {
   first:async()=>statement.get(...args),
   all:async()=>({results:statement.all(...args)}),
   run:async()=>statement.run(...args)
  };
 }
 return {calls,DB:{prepare(sql){
  return {
   bind(...args){return operations(sql,args)},
   first:async()=>operations(sql).first(),
   all:async()=>operations(sql).all(),
   run:async()=>operations(sql).run()
  };
 }}};
}
const digest=value=>createHash('sha256').update(value).digest('hex');
const qualified=async wrapped=>corporateAssetsStagingSchemaPreflight({
 APP_ENV:'staging',ASSETS_STAGING_D1_ID:D1,DB:wrapped.DB
});

test('canonical synthetic Assets DB survives a private SQLite backup, recovery, auth and audit verification',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'thebe-assets-synthetic-restore-'));
 const backup=join(dir,'synthetic-assets.sqlite3');
 const original=new DatabaseSync(':memory:');
 let recovered;
 try{
  createSchema(original);
  seed(original);
  assert.equal(original.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const initial=wrap(original);
  assert.deepEqual(await qualified(initial),{ready:true,mode:'read_only_preflight'});
  assert.ok(initial.calls.every(x=>x.kind==='read'));
  // SQLite creates the snapshot in an isolated private local directory only.
  original.prepare('VACUUM INTO ?').run(backup);
  const bytes=readFileSync(backup);
  const expected=digest(bytes);
  assert.ok(bytes.length>4096,'backup must contain SQLite schema and data');
  assert.equal(digest(readFileSync(backup)),expected);
  // Any post-backup source mutation must not appear in the restored snapshot.
  original.prepare('UPDATE corporate_assets SET name=? WHERE id=?').run('Changed after backup',ASSET_A);
  recovered=new DatabaseSync(backup);
  recovered.exec('PRAGMA foreign_keys=ON;');
  assert.equal(recovered.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(recovered.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(recovered.prepare('SELECT name FROM corporate_assets WHERE id=?').get(ASSET_A).name,'Synthetic water pump');
  assert.equal(recovered.prepare('SELECT COUNT(*) n FROM corporate_assets').get().n,2);
  assert.equal(recovered.prepare('SELECT COUNT(*) n FROM corporate_asset_services').get().n,1);
  assert.equal(recovered.prepare('SELECT COUNT(*) n FROM audit_events').get().n,3);
  assert.equal(recovered.prepare('SELECT database_id FROM corporate_assets_staging_identity WHERE id=1').get().database_id,D1);
  const preflight=wrap(recovered);
  assert.deepEqual(await qualified(preflight),{ready:true,mode:'read_only_preflight'});
  assert.ok(preflight.calls.every(x=>x.kind==='read'));
  const runtime=wrap(recovered);
  const request=new Request('https://synthetic.invalid/api/auth/me',{
   headers:{cookie:'__Host-bw_session='+encodeURIComponent(SESSION_TOKEN)}});
  const auth=await authenticateWorkspaceSession(request,{DB:runtime.DB,SESSION_SECRET});
  assert.equal(auth?.user_id,USER);
  assert.equal(auth?.tenant_id,A);
  assert.equal(auth?.role,'owner');
  assert.equal(await authenticateWorkspaceSession(request,{DB:runtime.DB,SESSION_SECRET:'unrelated-replacement-key'}),null);
  assert.ok(runtime.calls.every(x=>x.kind==='read'));
  const userRead=await handleCorporateAssets({
   request:new Request('https://synthetic.invalid/api/corporate-assets/'+ASSET_B),
   env:{DB:runtime.DB,THEBE_CORPORATE_ASSETS_ENABLED:'true'},
   auth,readJson:async()=>{throw Error('GET cannot write')}
  });
  assert.equal(userRead.status,404,'authenticated owner A must not read tenant B asset');
  const own=await handleCorporateAssets({
   request:new Request('https://synthetic.invalid/api/corporate-assets/'+ASSET_A),
   env:{DB:runtime.DB,THEBE_CORPORATE_ASSETS_ENABLED:'true'},
   auth,readJson:async()=>{throw Error('GET cannot write')}
  });
  assert.equal(own.status,200);
  assert.equal((await own.json()).item.name,'Synthetic water pump');
  const sealed=wrap(recovered,{auditReceiptWrites:true});
  const integrity=await verifyAuditChainForTests({DB:sealed.DB,AUDIT_INTEGRITY_SECRET:AUDIT_SECRET},A);
  assert.equal(integrity.status,'valid');
  assert.equal(integrity.checkedEvents,2);
  assert.equal(sealed.calls.filter(x=>x.kind==='synthetic_audit_receipt').length,1);
  const privateEntry=createCorporateAssetsStagingEntry();
  const status=await privateEntry.fetch(
   new Request('https://synthetic.invalid/api/corporate-assets-staging/status'),
   {...renderCorporateAssetsStagingConfig(MARKER_ENV).vars,DB:wrap(recovered).DB});
  assert.equal(status.status,200);
  assert.equal((await status.json()).assetWritesEnabled,false);
  const forbidden=await privateEntry.fetch(
   new Request('https://synthetic.invalid/api/corporate-assets',{method:'POST'}),
   {...renderCorporateAssetsStagingConfig(MARKER_ENV).vars,DB:wrap(recovered).DB});
  assert.equal(forbidden.status,403);
  // Compare a corrupted copy by checksum before restoring, never execute it.
  const tampered=Buffer.from(bytes);tampered[100]^=1;
  assert.notEqual(digest(tampered),expected,'integrity gate must detect altered backup bytes');
  // A changed audit event invalidates canonical verification after recovery.
  recovered.prepare('UPDATE audit_events SET event_data=? WHERE tenant_id=? AND tenant_seq=?')
   .run('{"tampered":true}',A,1);
  const invalid=await verifyAuditChainForTests({
   DB:wrap(recovered,{auditReceiptWrites:true}).DB,AUDIT_INTEGRITY_SECRET:AUDIT_SECRET},A);
  assert.equal(invalid.status,'invalid');
  assert.equal(invalid.firstInvalidSeq,1);
 }finally{
  recovered?.close();
  original.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
