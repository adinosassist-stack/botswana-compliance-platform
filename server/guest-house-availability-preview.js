/**
 * Guest-house booking availability preview. Pure and read-only.
 * Dates use local calendar YYYY-MM-DD, checkout exclusive. No guest PII.
 * Authenticated callers must load only their own property's rows.
 */
function day(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      Number.isNaN(Date.parse(s + "T00:00:00Z")) ||
      new Date(s + "T00:00:00Z").toISOString().slice(0,10) !== s) throw new TypeError("invalid_date");
  return s;
}
export function previewGuestHouseAvailability({propertyId, rooms, reservations, checkIn, checkOut}={}) {
  if(typeof propertyId!=="string" || !propertyId.trim()) throw new TypeError("invalid_property");
  day(checkIn); day(checkOut);
  if(checkOut<=checkIn) throw new TypeError("invalid_stay");
  const nights=(Date.parse(checkOut+"T00:00:00Z")-Date.parse(checkIn+"T00:00:00Z"))/86400000;
  if(nights>365) throw new RangeError("stay_too_long");
  if(!Array.isArray(rooms)||rooms.length>1000||!Array.isArray(reservations)||reservations.length>10000) throw new TypeError("invalid_rows");
  const ids=new Set();
  for(const room of rooms){
    if(!room||room.propertyId!==propertyId||typeof room.id!=="string"||!room.id.trim()||ids.has(room.id)||
       !["available","out_of_service"].includes(room.status)||!Number.isSafeInteger(room.nightlyRateThebe)||room.nightlyRateThebe<0) throw new TypeError("invalid_room");
    ids.add(room.id);
  }
  const blocked=new Set();
  const reservationIds=new Set();
  for(const r of reservations){
    if(!r||r.propertyId!==propertyId||typeof r.id!=="string"||!r.id.trim()||reservationIds.has(r.id)||
       !ids.has(r.roomId)||!["held","confirmed","checked_in","checked_out","cancelled"].includes(r.status)) throw new TypeError("invalid_reservation");
    reservationIds.add(r.id);
    day(r.checkIn);day(r.checkOut);
    if(r.checkOut<=r.checkIn) throw new TypeError("invalid_reservation_dates");
    if(["held","confirmed","checked_in"].includes(r.status)&&r.checkIn<checkOut&&checkIn<r.checkOut) blocked.add(r.roomId);
  }
  const available=rooms.filter(r=>r.status==="available"&&!blocked.has(r.id));
  return Object.freeze({propertyId,checkIn,checkOut,nights,previewOnly:true,currency:"BWP",
    totalRooms:rooms.length,availableCount:available.length,blockedCount:blocked.size,
    availableRooms:Object.freeze(available.map(r=>Object.freeze({roomId:r.id,nightlyRateThebe:r.nightlyRateThebe,
      stayTotalThebe:Number.isSafeInteger(r.nightlyRateThebe*nights)?r.nightlyRateThebe*nights:null})))});
}
