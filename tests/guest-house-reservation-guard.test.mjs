import test from "node:test";
import assert from "node:assert/strict";
import {assertReservationSlot} from "../server/guest-house-reservation-guard.js";
const base={tenantId:"t",propertyId:"p",roomId:"r",checkIn:"2026-11-10",checkOut:"2026-11-12"};
const reservation={id:"b",tenantId:"t",propertyId:"p",roomId:"r",status:"confirmed",checkIn:"2026-11-11",checkOut:"2026-11-13"};
test("rejects overlapping active reservation",()=>{
 assert.throws(()=>assertReservationSlot({...base,existing:[reservation]}),{code:"room_unavailable"});
});
test("allows adjacent stays and cancelled reservations",()=>{
 assert.equal(assertReservationSlot({...base,existing:[{...reservation,checkIn:"2026-11-12"}]}).allowed,true);
 assert.equal(assertReservationSlot({...base,existing:[{...reservation,status:"cancelled"}]}).allowed,true);
});
test("rejects unscoped or malformed database rows",()=>{
 assert.throws(()=>assertReservationSlot({...base,existing:[{...reservation,tenantId:"other"}]}));
 assert.throws(()=>assertReservationSlot({...base,existing:[{...reservation,checkOut:"2026-02-30"}]}));
 assert.throws(()=>assertReservationSlot({...base,checkOut:"2026-11-10",existing:[]}));
});
test("supports updating the same reservation",()=>{
 assert.equal(assertReservationSlot({...base,existing:[reservation],excludeReservationId:"b"}).allowed,true);
});
