/**
 * Parameterized, single-statement SQLite/D1 reservation insertion.
 * NOT a route: the caller MUST authenticate the tenant/property/room and
 * validate dates, statuses, and rate before executing. Run on the primary
 * D1 writer, not an eventually consistent replica. Zero returned rows means
 * room unavailable or room not found; do not infer which for public clients.
 *
 * The conditional INSERT and NOT EXISTS execute in one SQLite statement,
 * avoiding a client-side read-then-write race. Do not split these operations.
 */
export const INSERT_RESERVATION_IF_FREE = `
INSERT INTO guest_house_reservations
 (id, tenant_id, property_id, room_id, check_in, check_out, status, nightly_rate_minor)
SELECT ?, ?, ?, ?, ?, ?, ?, ?
WHERE EXISTS (
 SELECT 1 FROM guest_house_rooms room
 WHERE room.tenant_id = ? AND room.property_id = ?
   AND room.id = ? AND room.status = 'available'
)
AND NOT EXISTS (
 SELECT 1 FROM guest_house_reservations booking
 WHERE booking.tenant_id = ? AND booking.property_id = ?
   AND booking.room_id = ?
   AND booking.status IN ('held','confirmed','checked_in')
   AND booking.check_in < ? AND ? < booking.check_out
)
RETURNING id, tenant_id, property_id, room_id, check_in, check_out, status
`.trim();

const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+"T00:00:00Z"))&&
 new Date(Date.parse(s+"T00:00:00Z")).toISOString().slice(0,10)===s;
export function prepareReservationInsert(input){
 if(!input||typeof input!=="object")throw new TypeError("invalid_input");
 const {id,tenantId,propertyId,roomId,checkIn,checkOut,status,nightlyRateMinor}=input;
 for(const value of [id,tenantId,propertyId,roomId])
  if(typeof value!=="string"||!value.trim()||value.length>160)throw new TypeError("invalid_identifier");
 if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn)throw new TypeError("invalid_stay");
 const nights=(Date.parse(checkOut+"T00:00:00Z")-Date.parse(checkIn+"T00:00:00Z"))/86400000;
 if(nights>365)throw new TypeError("stay_too_long");
 if(!["held","confirmed"].includes(status))throw new TypeError("invalid_initial_status");
 if(!Number.isSafeInteger(nightlyRateMinor)||nightlyRateMinor<0||nightlyRateMinor>999999999999)
  throw new TypeError("invalid_rate");
 return Object.freeze({sql:INSERT_RESERVATION_IF_FREE,
  bindings:Object.freeze([id,tenantId,propertyId,roomId,checkIn,checkOut,status,nightlyRateMinor,
   tenantId,propertyId,roomId,tenantId,propertyId,roomId,checkOut,checkIn])});
}
