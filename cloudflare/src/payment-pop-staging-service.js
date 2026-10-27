import {authorizePopSubmission} from "./payment-pop-order-authority.js";
import {quarantinePop} from "./payment-pop-quarantine-store.js";
// Staging-only service boundary. Caller must pass trusted session identity, never client-provided role/tenant.
export async function stagePopSubmission(env,{session,orderId,documentId,bytes,name,contentType}={}){
 if(String(env?.POP_UPLOAD_STAGING_ENABLED||"false")!=="true")throw new Error("pop_upload_disabled");
 if(!session?.tenantId||!session?.role||!session?.userId)throw new Error("pop_unauthenticated");
 const authority=await authorizePopSubmission(env.DB,{tenantId:session.tenantId,actorRole:session.role,orderId});
 const stored=await quarantinePop(env,{tenantId:authority.tenantId,orderId:authority.orderId,documentId,bytes,name,contentType});
 return {documentId,orderId:authority.orderId,scanStatus:stored.scanStatus,reviewable:false,bankFundsConfirmed:false,subscriptionActivated:false};
}
