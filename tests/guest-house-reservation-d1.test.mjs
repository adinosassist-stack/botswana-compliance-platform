import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createGuestHouseReservation} from '../cloudflare/src/guest-house-reservation-command.js';

const scope={authenticated:true,canManageReservations:true,tenantId:'tenant-a',propertyId:'property-a'};
const stay={roomId:'room-a',checkIn:'2026-11-10',checkOut:'2026-11-12',status:'confirmed'};

async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:"export default {fetch(){return new Response('local isolated guest-house D1')}}",
  compatibilityDate:'2026-09-03',d1Databases:{DB:'guest-house-isolated-reservation-proof'}
 }));
 try{
  const db=await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run();
  const schema=readFileSync(new URL('../cloudflare/schema/guest-house-management-proposal.sql',import.meta.url),'utf8');
  for(const statement of splitSqliteMigrationStatements(schema))await db.prepare(statement).run();
  for(const tenant of ['tenant-a','tenant-b'])
   await db.prepare('INSERT INTO tenants(id) VALUES(?)').bind(tenant).run();
  await db.prepare("INSERT INTO guest_house_properties(id,tenant_id,name) VALUES('property-a','tenant-a','Local A'),('property-b','tenant-b','Local B')").run();
  await db.prepare("INSERT INTO guest_house_rooms(id,tenant_id,property_id,room_code,status,nightly_rate_minor) VALUES('room-a','tenant-a','property-a','A','available',44000),('room-b','tenant-a','property-a','B','available',50000),('room-c','tenant-b','property-b','C','available',55000),('room-closed','tenant-a','property-a','Closed','out_of_service',12000)").run();
  return {mf,db,close:()=>mf.dispose()};
 }catch(error){await mf.dispose();throw error;}
}
const book=(db,id,patch={},authorizedScope=scope)=>createGuestHouseReservation({
 db,authorizedScope,booking:{id,...stay,...patch}
});
const count=db=>db.prepare('SELECT COUNT(*) AS n FROM guest_house_reservations').first();

test('actual isolated D1 primary writer admits exactly one of two concurrent overlapping bookings',async()=>{
 const f=await fixture();
 try{
  const requests=await Promise.all([
   book(f.db,'booking-a'),
   book(f.db,'booking-b',{checkIn:'2026-11-11',checkOut:'2026-11-13'})
  ]);
  assert.equal(requests.filter(r=>r.ok).length,1);
  assert.equal(requests.filter(r=>!r.ok&&r.reason==='room_unavailable').length,1);
  assert.equal((await count(f.db)).n,1,'one reservation persisted');
  const saved=await f.db.prepare('SELECT nightly_rate_minor,room_id FROM guest_house_reservations').first();
  assert.equal(saved.nightly_rate_minor,44000,'database sets price, never browser');
  assert.equal(saved.room_id,'room-a');
 }finally{await f.close();}
});

test('same server-issued ID replay is stable, conflicting replay and cross-tenant ID collision fail closed',async()=>{
 const f=await fixture();
 try{
  assert.equal((await book(f.db,'booking-stable')).ok,true);
  const replay=await book(f.db,'booking-stable');
  assert.equal(replay.ok,true);
  assert.equal(replay.replayed,true);
  assert.equal((await count(f.db)).n,1);
  const changed=await book(f.db,'booking-stable',{checkOut:'2026-11-13'});
  assert.deepEqual(changed,{ok:false,reason:'room_unavailable'});
  const cross=await book(f.db,'booking-stable',{roomId:'room-c'},{
   ...scope,tenantId:'tenant-b',propertyId:'property-b'
  });
  assert.deepEqual(cross,{ok:false,reason:'room_unavailable'});
  assert.equal((await count(f.db)).n,1);
  await f.db.prepare("UPDATE guest_house_reservations SET status='cancelled' WHERE id='booking-stable'").run();
  assert.deepEqual(await book(f.db,'booking-stable'),{ok:false,reason:'room_unavailable'},
   'cancelled records cannot be revived by retrying a previous request');
  assert.equal((await book(f.db,'booking-replacement')).ok,true,
   'new booking ID may reuse cancelled availability');
  assert.equal((await count(f.db)).n,2);
 }finally{await f.close();}
});

test('local D1 blocks overlap through direct INSERT and later status UPDATE, but permits checkout-adjacent stays',async()=>{
 const f=await fixture();
 try{
  assert.equal((await book(f.db,'booking-confirmed')).ok,true);
  await assert.rejects(f.db.prepare(`INSERT INTO guest_house_reservations
   (id,tenant_id,property_id,room_id,check_in,check_out,status,nightly_rate_minor)
   VALUES('direct-overlap','tenant-a','property-a','room-a','2026-11-11','2026-11-12','confirmed',999)`).run(),/reservation_overlap/);
  await f.db.prepare(`INSERT INTO guest_house_reservations
   (id,tenant_id,property_id,room_id,check_in,check_out,status,nightly_rate_minor)
   VALUES('cancelled-overlap','tenant-a','property-a','room-a','2026-11-11','2026-11-12','cancelled',999)`).run();
  await assert.rejects(
   f.db.prepare("UPDATE guest_house_reservations SET status='confirmed' WHERE id='cancelled-overlap'").run(),
   /reservation_overlap/
  );
  const adjacent=await book(f.db,'adjacent',{checkIn:'2026-11-12',checkOut:'2026-11-13'});
  assert.equal(adjacent.ok,true);
  assert.deepEqual(await book(f.db,'blocked-room',{roomId:'room-closed'}),{ok:false,reason:'room_unavailable'});
  assert.equal((await count(f.db)).n,3);
 }finally{await f.close();}
});

test('local D1 rejects spoofed price, foreign property and unauthorized management before persistence',async()=>{
 const f=await fixture();
 try{
  await assert.rejects(book(f.db,'price-spoof',{nightlyRateMinor:1}),/client_rate_not_allowed/);
  await assert.rejects(book(f.db,'denied',{}, {...scope,canManageReservations:false}),/reservation_access_denied/);
  assert.deepEqual(await book(f.db,'foreign',{roomId:'room-c'}),{ok:false,reason:'room_unavailable'});
  assert.equal((await count(f.db)).n,0);
 }finally{await f.close();}
});
