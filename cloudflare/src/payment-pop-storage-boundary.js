// Internal storage identifiers only. No public URLs or bank approval effects.
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function popQuarantineKey({tenantId,orderId,documentId}={}) {
  if (![tenantId,orderId,documentId].every(x=>ID.test(String(x||"")))) throw new Error("invalid_pop_scope");
  return "payment-pop/quarantine/"+tenantId+"/"+orderId+"/"+documentId;
}
export function popOwnerReadAllowed({platformOwner,tenantMatches,scanStatus,deletedAt}={}) {
  return platformOwner===true&&tenantMatches===true&&scanStatus==="clean"&&deletedAt==null;
}
