import {prepareReservationInsert} from "./guest-house-reservation-insert.js";

/**
 * Server-side reservation command for an already authenticated and authorized
 * property scope. Authorization MUST be resolved by trusted middleware, not
 * constructed from user-supplied JSON. No route is registered by this module.
 *
 * D1 executes the conditional INSERT as one SQLite statement. The caller must
 * use the primary writer and provide a unique server-generated reservation ID.
 * Retries with the same ID are not automatically idempotent: callers must use
 * a separately reviewed idempotency protocol.
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
 if(!inserted)return Object.freeze({ok:false,reason:"room_unavailable"});
 if(inserted.tenant_id!==authorizedScope.tenantId||
    inserted.property_id!==authorizedScope.propertyId||
    inserted.id!==booking.id||inserted.room_id!==booking.roomId)
   throw new Error("reservation_result_scope_mismatch");
 return Object.freeze({ok:true,reservationId:inserted.id,roomId:inserted.room_id,
  checkIn:inserted.check_in,checkOut:inserted.check_out,status:inserted.status});
}
