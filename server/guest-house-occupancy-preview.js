/**
 * Property-scoped occupancy report for a closed date range.
 * Read-only planning metric, not a live booking or revenue ledger.
 * Date intervals are [checkIn, checkOut); guest PII is excluded.
 */
const dateValue=s=>{
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new TypeError("invalid_date");
 const n=Date.parse(s+"T00:00:00Z");
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s) throw new TypeError("invalid_date");
 return n/86400000;
};
export function previewGuestHouseOccupancy({propertyId,rooms,reservations,from,to}={}){
 if(typeof propertyId!=="string"||!propertyId.trim()) throw new TypeError("invalid_property");
 const start=dateValue(from),end=dateValue(to);
 if(end<=start||end-start>366) throw new TypeError("invalid_period");
 if(!Array.isArray(rooms)||rooms.length>1000||!Array.isArray(reservations)||reservations.length>10000) throw new TypeError("invalid_rows");
 const ids=new Set();
 for(const room of rooms){
  if(!room||room.propertyId!==propertyId||typeof room.id!=="string"||!room.id.trim()||ids.has(room.id)) throw new TypeError("invalid_room");
  ids.add(room.id);
 }
 const occupied=new Set(),reservationIds=new Set();
 for(const r of reservations){
  if(!r||r.propertyId!==propertyId||typeof r.id!=="string"||!r.id.trim()||reservationIds.has(r.id)||
    !ids.has(r.roomId)||!["held","confirmed","checked_in","checked_out","cancelled"].includes(r.status)) throw new TypeError("invalid_reservation");
  reservationIds.add(r.id);
  const a=dateValue(r.checkIn),b=dateValue(r.checkOut);
  if(b<=a) throw new TypeError("invalid_reservation_dates");
  if(!["confirmed","checked_in","checked_out"].includes(r.status)) continue;
  for(let d=Math.max(start,a);d<Math.min(end,b);d++){
   const key=r.roomId+":"+d;
   if(occupied.has(key)) throw new TypeError("overlapping_reservations");
   occupied.add(key);
  }
 }
 const capacityRoomNights=rooms.length*(end-start);
 const occupiedRoomNights=occupied.size;
 return Object.freeze({propertyId,from,to,previewOnly:true,totalRooms:rooms.length,
  capacityRoomNights,occupiedRoomNights,availableRoomNights:capacityRoomNights-occupiedRoomNights,
  occupancyPercent:capacityRoomNights?Math.round(occupiedRoomNights/capacityRoomNights*10000)/100:0});
}
