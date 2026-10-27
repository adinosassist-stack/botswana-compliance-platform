/** Unregistered trusted-source resolver for future AI Dock document export.
 * Never reads a conversation solely on the basis of an untrusted browser ID.
 * Does not create endpoints, perform writes, or activate export features.
 */
import {createHash} from "node:crypto";
import {validateExportDocument} from "./ai-document-export-model.js";
const validId=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
const notDeleted=row=>row&&row.deletedAt==null&&row.deleted_at==null&&row.deleted!==true;
export function createAuthorizedAiExportMessageLoader({
 readConversation,canReadConversation,readMessage,documentForMessage
}={}){
 if([readConversation,canReadConversation,readMessage,documentForMessage].some(x=>typeof x!=="function"))
  throw new TypeError("trusted_export_source_dependencies_required");
 return async function loadAuthorizedAiMessage({tenantId,actorId,conversationId,messageId}={}){
  if(![tenantId,actorId,conversationId,messageId].every(validId))return null;
  try{
   const conversation=await readConversation({tenantId,conversationId});
   if(!notDeleted(conversation)||conversation.id!==conversationId||conversation.tenantId!==tenantId)return null;
   // Membership/ACL verification is mandatory; anything other than literal true denies.
   const permitted=await canReadConversation({tenantId,actorId,conversationId,conversation});
   if(permitted!==true)return null;
   const message=await readMessage({tenantId,conversationId,messageId});
   if(!notDeleted(message)||message.id!==messageId||
      message.tenantId!==tenantId||message.conversationId!==conversationId||
      message.role!=="assistant"||message.isFinal!==true)return null;
   // documentForMessage MUST transform a trusted persisted message, never request body text.
   const document=await documentForMessage({tenantId,actorId,conversation,message});
   const validated=validateExportDocument(document);
   if(!validated.ok)return null;
   const normalized=validated.value;
   const hash=createHash("sha256").update(JSON.stringify(normalized),"utf8").digest("hex");
   return Object.freeze({authorized:true,actorRole:"assistant",contentHash:hash,document:normalized});
  }catch{return null}
 };
}
