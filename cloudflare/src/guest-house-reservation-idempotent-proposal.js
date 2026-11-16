import {prepareReservationInsert} from "./guest-house-reservation-insert.js";

/**
 * PROPOSAL ONLY: no HTTP route, migration or customer activation.
 *
 * Reserve an authenticated-property-scoped idempotency key on the reservation
 * row in the SAME SQLite INSERT as the booking and its audit trigger.
 * The key MUST come from trusted middleware, not from the booking JSON.
 * A retry with a different server-issued booking ID can return the first
 * reservation only when every meaningful booking field still matches.
 *
 * Requires the un-deployed guest-house-management-proposal.sql unique index.
 * Never use a read replica: this command requires the D1 primary writer.
 */
export const INSERT_GUEST_HOUSE_IDEMPOTENT = `
INSERT INTO guest_house_reservations
 (id,tenant_id,property_id,room_id,check_in,check_out,status,nightly_rate_minor,idempotency_key)
SELECT ?,?,?,?,?,?,?,room.nightly_rate_minor,?
FROM guest_house_rooms room
WHERE room.tenant_id=? AND room.property_id=? AND room.id=?
 AND room.status='available'
 AND NOT EXISTS (SELECT 1 FROM guest_house_reservations duplicate WHERE duplicate.id=?)
 AND NOT EXISTS (
  SELECT 1 FROM guest_house_reservations prior
  WHERE prior.tenant_id=? AND prior.property_id=? AND prior.idempotency_key=?
 )
 AND NOT EXISTS (
  SELECT 1 FROM guest_house_reservations reserved
  WHERE reserved.tenant_id=? AND reserved.property_id=? AND reserved.room_id=?
    AND reserved.status IN ('held','confirmed','checked_in')
    AND reserved.check_in < ? AND ? < reserved.check_out
 )
RETURNING id,tenant_id,property_id,room_id,check_in,check_out,status,nightly_rate_minor,idempotency_key
`.trim();

export async function createIdempotentGuestHouseReservation({
 db, authorizedScope, booking, trustedRequestKey
}={}){
 if(!db||typeof db.prepare!=="function")throw new TypeError("invalid_database");
 if(!authorizedScope||authorizedScope.authenticated!==true||
    authorizedScope.canManageReservations!==true||
    typeof authorizedScope.tenantId!=="string"||!authorizedScope.tenantId.trim()||
    typeof authorizedScope.propertyId!=="string"||!authorizedScope.propertyId.trim())
  throw new Error("reservation_access_denied");
 if(!booking||typeof booking!=="object"||Array.isArray(booking)||
    ["tenantId","propertyId","idempotencyKey","trustedRequestKey"].some(k=>Object.hasOwn(booking,k)))
  throw new TypeError("invalid_booking_payload");
 if(typeof trustedRequestKey!=="string"||!/^[A-Za-z0-9_-]{16,128}$/.test(trustedRequestKey))
  throw new TypeError("invalid_trusted_request_key");

 // Reuse the established date, price, status and identifier validation.
 const {bindings:b}=prepareReservationInsert({
  ...booking,tenantId:authorizedScope.tenantId,propertyId:authorizedScope.propertyId
 });
 const values=[...b.slice(0,7),trustedRequestKey,...b.slice(7,11),
  authorizedScope.tenantId,authorizedScope.propertyId,trustedRequestKey,
  ...b.slice(11)];
 const inserted=await db.prepare(INSERT_GUEST_HOUSE_IDEMPOTENT).bind(...values).first();
 if(inserted){
  if(inserted.tenant_id!==authorizedScope.tenantId||
     inserted.property_id!==authorizedScope.propertyId||
     inserted.id!==booking.id||inserted.room_id!==booking.roomId||
     inserted.check_in!==booking.checkIn||inserted.check_out!==booking.checkOut||
     inserted.status!==booking.status||inserted.idempotency_key!==trustedRequestKey||
     !Number.isSafeInteger(inserted.nightly_rate_minor)||inserted.nightly_rate_minor<0)
   throw new Error("reservation_result_scope_mismatch");
  return Object.freeze({ok:true,reservationId:inserted.id,roomId:inserted.room_id,
   checkIn:inserted.check_in,checkOut:inserted.check_out,status:inserted.status});
 }

 // Read from the same primary writer. A foreign tenant/property key is never
 // returned. Never revive cancelled/changed bookings on a replay.
 const existing=await db.prepare(`SELECT id,tenant_id,property_id,room_id,check_in,check_out,
   status,nightly_rate_minor,idempotency_key FROM guest_house_reservations
   WHERE tenant_id=? AND property_id=? AND idempotency_key=?`)
  .bind(authorizedScope.tenantId,authorizedScope.propertyId,trustedRequestKey).first();
 if(!existing)return Object.freeze({ok:false,reason:"room_unavailable"});
 if(existing.room_id!==booking.roomId||existing.check_in!==booking.checkIn||
    existing.check_out!==booking.checkOut||existing.status!==booking.status||
    !Number.isSafeInteger(existing.nightly_rate_minor)||existing.nightly_rate_minor<0)
  return Object.freeze({ok:false,reason:"idempotency_conflict"});
 return Object.freeze({ok:true,reservationId:existing.id,roomId:existing.room_id,
  checkIn:existing.check_in,checkOut:existing.check_out,status:existing.status,replayed:true});
}
