/**
 * Guard for reservation commands. Call within an authenticated, serialized
 * database write transaction using current rows locked/serialized by the DB.
 * This function alone cannot prevent races and must never authorize a booking.
 */
const active=new Set(["held","confirmed","checked_in"]);
function day(s){
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new TypeError("invalid_date");
 const d=Date.parse(s+"T00:00:00Z");
 if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==s)throw new TypeError("invalid_date");
 return s;
}
export function assertReservationSlot({tenantId,propertyId,roomId,checkIn,checkOut,existing,excludeReservationId=null}={}){
 for(const [label,value] of Object.entries({tenantId,propertyId,roomId})){
  if(typeof value!=="string"||!value.trim())throw new TypeError("invalid_"+label);
 }
 day(checkIn);day(checkOut);
 if(checkOut<=checkIn)throw new TypeError("invalid_stay");
 if(!Array.isArray(existing)||existing.length>10000)throw new TypeError("invalid_existing");
 for(const r of existing){
  if(!r||r.tenantId!==tenantId||r.propertyId!==propertyId||r.roomId!==roomId||
    typeof r.id!=="string"||!r.id.trim()||
    !["held","confirmed","checked_in","checked_out","cancelled"].includes(r.status))
   throw new TypeError("invalid_existing_reservation");
  day(r.checkIn);day(r.checkOut);
  if(r.checkOut<=r.checkIn)throw new TypeError("invalid_existing_dates");
  if(r.id!==excludeReservationId&&active.has(r.status)&&r.checkIn<checkOut&&checkIn<r.checkOut){
   const error=new Error("room_unavailable");
   error.code="room_unavailable";
   throw error;
  }
 }
 return Object.freeze({allowed:true,previewOnly:true,roomId,checkIn,checkOut});
}
