import test from "node:test";
import assert from "node:assert/strict";
import {createGuestHouseReservation} from "../cloudflare/src/guest-house-reservation-command.js";
const scope={authenticated:true,canManageReservations:true,tenantId:"tenant",propertyId:"property"};
const booking={id:"reservation-1",roomId:"room-1",checkIn:"2026-11-10",checkOut:"2026-11-12",status:"confirmed",nightlyRateMinor:40000};
function fakeDb(row){
 const calls=[];
 return {calls,prepare(sql){calls.push({sql});return {bind(...values){calls.push({values});return {async first(){return row;}};}};}};
}
test("writes with trusted authorization scope, not request scope",async()=>{
 const db=fakeDb({id:booking.id,tenant_id:"tenant",property_id:"property",room_id:"room-1",check_in:booking.checkIn,check_out:booking.checkOut,status:"confirmed"});
 const result=await createGuestHouseReservation({db,authorizedScope:scope,booking});
 assert.equal(result.ok,true);
 assert.equal(db.calls[1].values[1],"tenant");
 assert.equal(db.calls[1].values[2],"property");
});
test("fails closed on missing authorization before accessing database",async()=>{
 const db=fakeDb(null);
 await assert.rejects(createGuestHouseReservation({db,authorizedScope:{...scope,canManageReservations:false},booking}),/access_denied/);
 assert.equal(db.calls.length,0);
});
test("rejects client-supplied tenant and property",async()=>{
 const db=fakeDb(null);
 await assert.rejects(createGuestHouseReservation({db,authorizedScope:scope,booking:{...booking,tenantId:"other"}}),/invalid_booking_payload/);
 assert.equal(db.calls.length,0);
});
test("returns unavailable for conditional insert without a row",async()=>{
 const result=await createGuestHouseReservation({db:fakeDb(null),authorizedScope:scope,booking});
 assert.deepEqual(result,{ok:false,reason:"room_unavailable"});
});
test("fails closed on unexpected cross-scope database result",async()=>{
 const db=fakeDb({id:booking.id,tenant_id:"other",property_id:"property",room_id:"room-1"});
 await assert.rejects(createGuestHouseReservation({db,authorizedScope:scope,booking}),/scope_mismatch/);
});
