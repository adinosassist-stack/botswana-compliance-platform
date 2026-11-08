/**
 * Atomic conditional reservation insertion for SQLite/D1 primary writer.
 * Room price is sourced from the database, NEVER from a client request.
 * Caller must enforce authenticated property authorization and idempotency.
 */
export const INSERT_RESERVATION_IF_FREE = `
INSERT INTO guest_house_reservations
 (id, tenant_id, property_id, room_id, check_in, check_out, status, nightly_rate_minor)
SELECT ?, ?, ?, ?, ?, ?, ?, room.nightly_rate_minor
FROM guest_house_rooms room
WHERE room.tenant_id = ? AND room.property_id = ?
  AND room.id = ? AND room.status = 'available'
  AND NOT EXISTS (
    SELECT 1 FROM guest_house_reservations booking
    WHERE booking.tenant_id = ? AND booking.property_id = ?
      AND booking.room_id = ?
      AND booking.status IN ('held','confirmed','checked_in')
      AND booking.check_in < ? AND ? < booking.check_out
  )
RETURNING id, tenant_id, property_id, room_id, check_in, check_out, status, nightly_rate_minor
`.trim();

const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+"T00:00:00Z"))&&
 new Date(Date.parse(s+"T00:00:00Z")).toISOString().slice(0,10)===s;
export function prepareReservationInsert(input){
 if(!input||typeof input!=="object")throw new TypeError("invalid_input");
 const {id,tenantId,propertyId,roomId,checkIn,checkOut,status}=input;
 if(Object.hasOwn(input,"nightlyRateMinor")||Object.hasOwn(input,"nightlyRateThebe"))
  throw new TypeError("client_rate_not_allowed");
 for(const value of [id,tenantId,propertyId,roomId])
  if(typeof value!=="string"||!value.trim()||value.length>160)throw new TypeError("invalid_identifier");
 if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn)throw new TypeError("invalid_stay");
 const nights=(Date.parse(checkOut+"T00:00:00Z")-Date.parse(checkIn+"T00:00:00Z"))/86400000;
 if(nights>365)throw new TypeError("stay_too_long");
 if(!["held","confirmed"].includes(status))throw new TypeError("invalid_initial_status");
 return Object.freeze({sql:INSERT_RESERVATION_IF_FREE,
  bindings:Object.freeze([id,tenantId,propertyId,roomId,checkIn,checkOut,status,
   tenantId,propertyId,roomId,tenantId,propertyId,roomId,checkOut,checkIn])});
}
