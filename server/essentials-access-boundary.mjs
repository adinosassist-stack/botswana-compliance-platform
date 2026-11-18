/** Explicit authorization boundary for Essentials draft actions.
 * A trusted server must supply principal and tenant-scoped records from its session/DB.
 * This function does NOT authenticate users or grant permissions on its own.
 */
export function assertEssentialsDraftAccess({principal,tenantId,recordTenantId,permission}={}){
 const valid=v=>typeof v==="string"&&v.length>0&&v.length<=128&&/^[a-zA-Z0-9_-]+$/.test(v);
 if(!principal||!valid(principal.userId)||!valid(principal.tenantId)||!valid(tenantId)||!valid(recordTenantId))throw new TypeError("invalid_identity");
 if(principal.tenantId!==tenantId||recordTenantId!==tenantId)throw new Error("tenant_access_denied");
 if(!["quotation:read","invoice:draft:create","invoice:read","reminder:prepare","template:edit"].includes(permission))throw new TypeError("invalid_permission");
 if(!Array.isArray(principal.permissions)||!principal.permissions.includes(permission))throw new Error("permission_denied");
 return Object.freeze({authorized:true,tenantId,userId:principal.userId,permission});
}
