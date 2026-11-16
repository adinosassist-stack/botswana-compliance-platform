import test from "node:test";
import assert from "node:assert/strict";
import {previewGuestHouseAvailability} from "../server/guest-house-availability-preview.js";
const rooms=[
  {id:"r1",propertyId:"lovely-rooms",status:"available",nightlyRateThebe:45000},
  {id:"r2",propertyId:"lovely-rooms",status:"available",nightlyRateThebe:55000},
  {id:"r3",propertyId:"lovely-rooms",status:"out_of_service",nightlyRateThebe:65000}
];
const base={propertyId:"lovely-rooms",rooms,checkIn:"2026-11-10",checkOut:"2026-11-12"};
test("prevents overlapping bookings and respects maintenance closures",()=>{
 const result=previewGuestHouseAvailability({...base,reservations:[
  {id:"b1",propertyId:"lovely-rooms",roomId:"r1",status:"confirmed",checkIn:"2026-11-09",checkOut:"2026-11-11"}
 ]});
 assert.equal(result.availableCount,1);
 assert.equal(result.availableRooms[0].roomId,"r2");
 assert.equal(result.availableRooms[0].stayTotalThebe,110000);
 assert.equal(result.nights,2);
});
test("checkout date is exclusive; cancelled bookings do not block",()=>{
 const result=previewGuestHouseAvailability({...base,reservations:[
  {id:"b1",propertyId:"lovely-rooms",roomId:"r1",status:"confirmed",checkIn:"2026-11-08",checkOut:"2026-11-10"},
  {id:"b2",propertyId:"lovely-rooms",roomId:"r2",status:"cancelled",checkIn:"2026-11-10",checkOut:"2026-11-12"}
 ]});
 assert.equal(result.availableCount,2);
});
test("rejects foreign properties, invalid dates and unknown rooms",()=>{
 assert.throws(()=>previewGuestHouseAvailability({...base,rooms:[{...rooms[0],propertyId:"other"}],reservations:[]}));
 assert.throws(()=>previewGuestHouseAvailability({...base,checkIn:"2026-02-30",reservations:[]}));
 assert.throws(()=>previewGuestHouseAvailability({...base,reservations:[{id:"b",propertyId:"lovely-rooms",roomId:"missing",status:"confirmed",checkIn:"2026-11-10",checkOut:"2026-11-11"}]}));
});
