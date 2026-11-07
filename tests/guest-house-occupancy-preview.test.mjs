import test from "node:test";
import assert from "node:assert/strict";
import {previewGuestHouseOccupancy} from "../server/guest-house-occupancy-preview.js";
const rooms=[{id:"1",propertyId:"p"},{id:"2",propertyId:"p"},{id:"3",propertyId:"p"}];
const base={propertyId:"p",rooms,from:"2026-11-10",to:"2026-11-12"};
const booking={id:"b",propertyId:"p",roomId:"1",status:"confirmed",checkIn:"2026-11-10",checkOut:"2026-11-12"};
test("calculates room nights and occupancy",()=>{
 const r=previewGuestHouseOccupancy({...base,reservations:[booking]});
 assert.equal(r.capacityRoomNights,6);
 assert.equal(r.occupiedRoomNights,2);
 assert.equal(r.availableRoomNights,4);
 assert.equal(r.occupancyPercent,33.33);
});
test("excludes cancelled and held reservations from occupied nights",()=>{
 const r=previewGuestHouseOccupancy({...base,reservations:[{...booking,status:"cancelled"}]});
 assert.equal(r.occupiedRoomNights,0);
});
test("rejects duplicate bookings, cross-property rows and overlapping confirmed stays",()=>{
 assert.throws(()=>previewGuestHouseOccupancy({...base,reservations:[booking,booking]}));
 assert.throws(()=>previewGuestHouseOccupancy({...base,reservations:[{...booking,propertyId:"other"}]}));
 assert.throws(()=>previewGuestHouseOccupancy({...base,reservations:[booking,{...booking,id:"b2",checkIn:"2026-11-11",checkOut:"2026-11-13"}]}));
});
