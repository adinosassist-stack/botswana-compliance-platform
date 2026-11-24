// Synthetic staging client seam only. Not loaded by production or the live Dock.
// Transport must use the authenticated same-origin staging session and CSRF token.
const root="/api/conversation-staging/threads";
const validId=id=>typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const threadPath=id=>{if(!validId(id))throw Error("invalid_thread");return root+"/"+id+"/messages"};
const directoryPath=id=>{if(!validId(id))throw Error("invalid_thread");return root+"?"+new URLSearchParams({threadId:id})};
export function createConversationStagingClient({transport,currentScope,enabled=false}={}){
 if(typeof transport!=="function"||typeof currentScope!=="function")throw Error("trusted_staging_transport_required");
 let generation=0;
 async function request(path,method="GET",body){
  if(enabled!==true)throw Error("staging_client_disabled");
  const scope=currentScope(), epoch=generation;
  if(typeof scope!=="string"||!scope)throw Error("session_required");
  const options={method,cache:"no-store",credentials:"same-origin",redirect:"error"};
  if(body!==undefined){options.headers={"content-type":"application/json"};options.body=JSON.stringify(body)}
  const response=await transport(path,options);
  const value=await response.json();
  if(epoch!==generation||scope!==currentScope())throw Error("stale_conversation_response");
  if(!response.ok||value?.ok!==true)throw Error("conversation_request_failed_"+response.status);
  return value;
 }
 return Object.freeze({
  // Invalidate outstanding reads on login, logout, workspace or thread change.
  invalidate(){generation++},
  list(q=""){return request(root+"?"+new URLSearchParams({q}))},
  create(){return request(root,"POST")},
  rename(id,title){generation++;return request(directoryPath(id),"PATCH",{title})},
  remove(id){generation++;return request(directoryPath(id),"DELETE")},
  read(id){return request(threadPath(id))},
  append(id,{role,sourceKind,content,idempotencyKey}={}){return request(threadPath(id),"POST",{role,sourceKind,content,idempotencyKey})}
 });
}
