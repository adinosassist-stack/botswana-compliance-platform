// Server-side authorization boundary for later POP intake routes.
// Customer-supplied order IDs and payment references never establish bank receipt.
export async function authorizePopSubmission(db,{tenantId,actorRole,orderId}={}){
 if(!db || typeof db.prepare!=="function")throw new Error("pop_database_unavailable");
 if(actorRole!=="owner" || !tenantId || !orderId)throw new Error("pop_submission_forbidden");
 const order=await db.prepare("SELECT id,tenant_id,order_type,provider,status FROM payment_orders WHERE id=? AND tenant_id=? LIMIT 1")
  .bind(orderId,tenantId).first();
 if(!order || order.tenant_id!==tenantId)throw new Error("pop_order_not_found");
 if(order.order_type!=="subscription" || order.provider!=="manual_bank")throw new Error("pop_order_not_eligible");
 if(!["pending","processing"].includes(order.status))throw new Error("pop_order_not_submittable");
 return {tenantId:order.tenant_id,orderId:order.id};
}
