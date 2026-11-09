import test from "node:test";
import assert from "node:assert/strict";
import {createGuestHouseReservation} from "../cloudflare/src/guest-house-reservation-command.js";
const scope={authenticated:true,canManageReservations:true,tenantId:"tenant",propertyId:"property"};
const booking={id:"reservation-1",roomId:"room-1",checkIn:"2026-11-10",checkOut:"2026-11-12",status:"confirmed"};
function fakeDb(row){
 const calls=[];
 return {calls,prepare(sql){calls.push({sql});return {bind(...values){calls.push({values});return {async first(){return row;}};}};}};
}
test("writes with trusted authorization scope and database price",async()=>{
 const db=fakeDb({id:booking.id,tenant_id:"tenant",property_id:"property",room_id:"room-1",check_in:booking.checkIn,check_out:booking.checkOut,status:"confirmed",nightly_rate_minor:40000});
 const result=await createGuestHouseReservation({db,authorizedScope:scope,booking});
 assert.equal(result.ok,true);
 assert.equal(db.calls[1].values[1],"tenant");
 assert.equal(db.calls[1].values[2],"property");
 assert.match(db.calls[0].sql,/room\.nightly_rate_minor/);
});
test("fails closed on missing authorization before accessing database",async()=>{
 const db=fakeDb(null);
 await assert.rejects(createGuestHouseReservation({db,authorizedScope:{...scope,canManageReservations:false},booking}),/access_denied/);
 assert.equal(db.calls.length,0);
});
test("rejects client-supplied tenant, property or nightly rate",async()=>{
 for(const patch of [{tenantId:"other"},{propertyId:"other"},{nightlyRateMinor:1}]){
  const db=fakeDb(null);
  await assert.rejects(createGuestHouseReservation({db,authorizedScope:scope,booking:{...booking,...patch}}));
  assert.equal(db.calls.length,0);
 }
});
test("returns unavailable for conditional insert without a row",async()=>{
 const result=await createGuestHouseReservation({db:fakeDb(null),authorizedScope:scope,booking});
 assert.deepEqual(result,{ok:false,reason:"room_unavailable"});
});
test("fails closed on unexpected cross-scope database result",async()=>{
 const db=fakeDb({id:booking.id,tenant_id:"other",property_id:"property",room_id:"room-1"});
 await assert.rejects(createGuestHouseReservation({db,authorizedScope:scope,booking}),/scope_mismatch/);
});

test("rejects inconsistent dates or status in inserted reservation result",async()=>{
 const valid={id:booking.id,tenant_id:"tenant",property_id:"property",room_id:booking.roomId,
   check_in:booking.checkIn,check_out:booking.checkOut,status:booking.status,nightly_rate_minor:40000};
 for(const changed of [
  {check_in:"2026-11-11"},{check_out:"2026-11-13"},{status:"cancelled"},
  {nightly_rate_minor:-1},{nightly_rate_minor:1.5},{nightly_rate_minor:null}
 ]){
  const db=fakeDb({...valid,...changed});
  await assert.rejects(createGuestHouseReservation({db,authorizedScope:scope,booking}),/scope_mismatch/);
 }
});
