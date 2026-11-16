import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createIdempotentGuestHouseReservation,INSERT_GUEST_HOUSE_IDEMPOTENT}
 from '../cloudflare/src/guest-house-reservation-idempotent-proposal.js';

const keyA='stable_key_for_booking_0001';
const scope={authenticated:true,canManageReservations:true,tenantId:'t-a',propertyId:'p-a'};
const booking={id:'reservation-a',roomId:'room-a',checkIn:'2026-11-10',checkOut:'2026-11-12',status:'confirmed'};
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:"export default {fetch(){return new Response('isolated fixture')}}",
  compatibilityDate:'2026-09-03',d1Databases:{DB:'isolated-guest-retry-v2'}
 }));
 try{
  const db=await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run();
  const sql=readFileSync(new URL('../cloudflare/schema/guest-house-management-proposal.sql',import.meta.url),'utf8');
  for(const stmt of splitSqliteMigrationStatements(sql))await db.prepare(stmt).run();
  await db.prepare("INSERT INTO tenants(id) VALUES('t-a'),('t-b')").run();
  await db.prepare("INSERT INTO guest_house_properties(id,tenant_id,name) VALUES('p-a','t-a','A'),('p-b','t-b','B')").run();
  await db.prepare("INSERT INTO guest_house_rooms(id,tenant_id,property_id,room_code,nightly_rate_minor) VALUES('room-a','t-a','p-a','A',44000),('room-b','t-a','p-a','B',55000),('room-c','t-b','p-b','C',66000)").run();
  return {db,mf};
 }catch(error){await mf.dispose();throw error;}
}
const reserve=(db,id,requestKey=keyA,patch={},authorizedScope=scope)=>createIdempotentGuestHouseReservation({
 db,authorizedScope,trustedRequestKey:requestKey,booking:{...booking,id,...patch}
});
const getCounts=async db=>{
 const bookings=await db.prepare("SELECT count(*) AS n FROM guest_house_reservations").first();
 const events=await db.prepare("SELECT count(*) AS n FROM guest_house_reservation_events").first();
 return [bookings.n,events.n];
};

test('candidate is a scoped single SQL INSERT with server-side room pricing',()=>{
 assert.ok(INSERT_GUEST_HOUSE_IDEMPOTENT.includes("room.nightly_rate_minor"));
 assert.ok(INSERT_GUEST_HOUSE_IDEMPOTENT.includes("prior.idempotency_key=?"));
 assert.match(INSERT_GUEST_HOUSE_IDEMPOTENT,/NOT EXISTS/);
 assert.equal(INSERT_GUEST_HOUSE_IDEMPOTENT.split("?").length-1,20);
});

test('concurrent same-key retries with different booking IDs write one audited reservation',async()=>{
 const f=await fixture();
 try{
  const outcomes=await Promise.all([reserve(f.db,'reservation-a'),reserve(f.db,'reservation-b')]);
  assert.equal(outcomes.filter(x=>x.ok).length,2);
  assert.equal(outcomes.filter(x=>x.replayed===true).length,1);
  assert.equal(outcomes[0].reservationId,outcomes[1].reservationId);
  assert.deepEqual(await getCounts(f.db),[1,1]);
  const row=await f.db.prepare("SELECT nightly_rate_minor,idempotency_key FROM guest_house_reservations").first();
  assert.equal(row.nightly_rate_minor,44000);
  assert.equal(row.idempotency_key,keyA);
  const again=await reserve(f.db,'reservation-retry');
  assert.equal(again.replayed,true);
  assert.deepEqual(await getCounts(f.db),[1,1]);
 }finally{await f.mf.dispose();}
});

test('reuse of an idempotency key with changed request or status never makes a fresh booking',async()=>{
 const f=await fixture();
 try{
  assert.equal((await reserve(f.db,'initial')).ok,true);
  for(const patch of [
   {roomId:'room-b'},{checkOut:'2026-11-13'},{status:'held'}
  ]){
   const r=await reserve(f.db,'changed',keyA,patch);
   assert.deepEqual(r,{ok:false,reason:'idempotency_conflict'});
  }
  assert.deepEqual(await getCounts(f.db),[1,1]);
  await f.db.prepare("UPDATE guest_house_reservations SET status='cancelled' WHERE id='initial'").run();
  assert.deepEqual(await reserve(f.db,'retry-after-cancel'),{ok:false,reason:'idempotency_conflict'});
  assert.equal((await reserve(f.db,'fresh-after-cancel','a_brand_new_request_key_0002')).ok,true);
  assert.deepEqual(await getCounts(f.db),[2,3]);
 }finally{await f.mf.dispose();}
});

test('same idempotency key is independently scoped to tenant and property',async()=>{
 const f=await fixture();
 try{
  assert.equal((await reserve(f.db,'tenant-a-id')).ok,true);
  const tenantB={...scope,tenantId:'t-b',propertyId:'p-b'};
  const r=await reserve(f.db,'tenant-b-id',keyA,{roomId:'room-c'},tenantB);
  assert.equal(r.ok,true);
  assert.notEqual(r.reservationId,'tenant-a-id');
  const tenantBReplay=await reserve(f.db,'another-id',keyA,{roomId:'room-c'},tenantB);
  assert.equal(tenantBReplay.replayed,true);
  assert.equal(tenantBReplay.reservationId,'tenant-b-id');
  assert.deepEqual(await getCounts(f.db),[2,2]);
 }finally{await f.mf.dispose();}
});

test('audit-write failure rolls back idempotency claim and allows subsequent retry',async()=>{
 const f=await fixture();
 try{
  await f.db.prepare(`CREATE TRIGGER fail_booking_audit BEFORE INSERT ON guest_house_reservation_events
   WHEN NEW.event_type='created' BEGIN SELECT RAISE(ABORT,'local_audit_failure'); END`).run();
  await assert.rejects(reserve(f.db,'attempt-1'),/local_audit_failure/);
  assert.deepEqual(await getCounts(f.db),[0,0]);
  await f.db.prepare('DROP TRIGGER fail_booking_audit').run();
  assert.equal((await reserve(f.db,'attempt-2')).ok,true);
  assert.deepEqual(await getCounts(f.db),[1,1]);
  await assert.rejects(f.db.prepare("UPDATE guest_house_reservations SET idempotency_key='different_trusted_key_1234' WHERE id='attempt-2'").run(),/reservation_identity_immutable/);
 }finally{await f.mf.dispose();}
});

test('scope, trusted key validation and browser key/price spoofing fail before database access',async()=>{
 const f=await fixture();
 try{
  const attempts=[
   reserve(f.db,'no-permission',keyA,{}, {...scope,canManageReservations:false}),
   reserve(f.db,'short','too-short'),
   reserve(f.db,'client-claimed',keyA,{idempotencyKey:'evil_input_value_012345'}),
   reserve(f.db,'client-rate',keyA,{nightlyRateMinor:1}),
   reserve(f.db,'client-scope',keyA,{propertyId:'p-b'}),
   reserve(f.db,'client-trusted',keyA,{trustedRequestKey:'evil_input_value_012345'})
  ];
  const result=await Promise.allSettled(attempts);
  assert.equal(result.filter(x=>x.status==='rejected').length,attempts.length);
  assert.deepEqual(await getCounts(f.db),[0,0]);
 }finally{await f.mf.dispose();}
});
