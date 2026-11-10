import test from "node:test";
import assert from "node:assert/strict";
import {prepareReservationInsert,INSERT_RESERVATION_IF_FREE} from "../cloudflare/src/guest-house-reservation-insert.js";
const base={id:"b1",tenantId:"t1",propertyId:"p1",roomId:"r1",checkIn:"2026-11-10",checkOut:"2026-11-12",status:"confirmed"};
test("single statement checks room membership, conflict and database price",()=>{
 const result=prepareReservationInsert(base);
 assert.match(result.sql,/INSERT INTO guest_house_reservations/);
 assert.match(result.sql,/room\.nightly_rate_minor/);
 assert.match(result.sql,/NOT EXISTS/);
 assert.match(result.sql,/booking\.check_in < \? AND \? < booking\.check_out/);
 assert.match(result.sql,/RETURNING id/);
 assert.equal(result.bindings.length,16);
 assert.deepEqual(result.bindings.slice(-2),[base.checkOut,base.checkIn]);
 assert.equal((INSERT_RESERVATION_IF_FREE.match(/\?/g)||[]).length,16);
});
test("rejects malformed dates, identifiers, status and client price",()=>{
 for(const patch of [{checkIn:"2026-02-30"},{checkOut:"2026-11-10"},{roomId:""},{status:"checked_in"},{nightlyRateMinor:0},{nightlyRateThebe:45000}]){
  assert.throws(()=>prepareReservationInsert({...base,...patch}));
 }
});
test("keeps parameter values outside SQL text",()=>{
 const result=prepareReservationInsert({...base,id:"test' OR 1=1 --"});
 assert.equal(result.sql.includes("test'"),false);
 assert.equal(result.bindings[0],"test' OR 1=1 --");
});

test("guards duplicate reservation IDs without reusing a cancelled record",()=>{
 const result=prepareReservationInsert(base);
 assert.ok(result.sql.includes('duplicate.id = ?'));
 assert.equal(result.bindings[10],base.id);
});
