import {prepareReservationInsert} from "./guest-house-reservation-insert.js";

/**
 * Server-side reservation command for an already authenticated and authorized
 * property scope. Authorization MUST be resolved by trusted middleware, not
 * constructed from user-supplied JSON. No route is registered by this module.
 *
 * D1 executes the conditional INSERT as one SQLite statement. The caller must
 * use the primary writer and provide a unique server-generated reservation ID.
 * An unchanged retry with the same server-issued reservation ID can be recognized.
 * A durable external idempotency ledger, audit and production integration still
 * require separate qualification. Changed/cancelled bookings fail closed.
 */
export async function createGuestHouseReservation({db,authorizedScope,booking}={}){
 if(!db||typeof db.prepare!=="function")throw new TypeError("invalid_database");
 if(!authorizedScope||authorizedScope.authenticated!==true||
    authorizedScope.canManageReservations!==true||
    typeof authorizedScope.tenantId!=="string"||!authorizedScope.tenantId.trim()||
    typeof authorizedScope.propertyId!=="string"||!authorizedScope.propertyId.trim())
   throw new Error("reservation_access_denied");
 if(!booking||typeof booking!=="object"||
    Object.hasOwn(booking,"tenantId")||Object.hasOwn(booking,"propertyId"))
   throw new TypeError("invalid_booking_payload");
 const prepared=prepareReservationInsert({...booking,
  tenantId:authorizedScope.tenantId,propertyId:authorizedScope.propertyId});
 const statement=db.prepare(prepared.sql);
 if(!statement||typeof statement.bind!=="function")throw new TypeError("invalid_statement");
 const bound=statement.bind(...prepared.bindings);
 if(!bound||typeof bound.first!=="function")throw new TypeError("invalid_statement");
 const inserted=await bound.first();
 if(!inserted){
  // Only a server-issued, stable reservation ID can be replayed safely.
  // Never treat a conflicting ID or a later status change as a successful retry.
  const existing=await db.prepare(`SELECT id, tenant_id, property_id, room_id, check_in, check_out, status, nightly_rate_minor
   FROM guest_house_reservations WHERE id=? AND tenant_id=? AND property_id=?`)
   .bind(booking.id,authorizedScope.tenantId,authorizedScope.propertyId).first();
  if(existing && existing.room_id===booking.roomId &&
     existing.check_in===booking.checkIn && existing.check_out===booking.checkOut &&
     existing.status===booking.status &&
     Number.isSafeInteger(existing.nightly_rate_minor) && existing.nightly_rate_minor>=0){
   return Object.freeze({ok:true,reservationId:existing.id,roomId:existing.room_id,
    checkIn:existing.check_in,checkOut:existing.check_out,status:existing.status,replayed:true});
  }
  return Object.freeze({ok:false,reason:"room_unavailable"});
 }
 if(inserted.tenant_id!==authorizedScope.tenantId||
    inserted.property_id!==authorizedScope.propertyId||
    inserted.id!==booking.id||inserted.room_id!==booking.roomId||
    inserted.check_in!==booking.checkIn||inserted.check_out!==booking.checkOut||
    inserted.status!==booking.status||
    !Number.isSafeInteger(inserted.nightly_rate_minor)||inserted.nightly_rate_minor<0)
   throw new Error("reservation_result_scope_mismatch");
 return Object.freeze({ok:true,reservationId:inserted.id,roomId:inserted.room_id,
  checkIn:inserted.check_in,checkOut:inserted.check_out,status:inserted.status});
}
