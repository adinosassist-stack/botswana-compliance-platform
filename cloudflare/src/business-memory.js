export const BUSINESS_MEMORY_VERSION="2026-09-26.v1";

const ALLOWED_NAMESPACES=new Set(["business","finance","sales","operations","language"]);
const KEY_RE=/^[a-z0-9][a-z0-9_.-]{0,79}$/;
const FORBIDDEN_KEY_TERMS=/(password|secret|token|credential|medical|health|disciplin|termination|national_id|passport|bank_account|card_number)/i;
const MAX_VALUE_BYTES=4096;
const frozen=value=>Object.freeze(value);
const clean=(value,max=240)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function normalizeNamespace(value){const ns=clean(value,40).toLowerCase();return ALLOWED_NAMESPACES.has(ns)?ns:null}
function normalizeKey(value){const key=clean(value,80).toLowerCase();return KEY_RE.test(key)&&!FORBIDDEN_KEY_TERMS.test(key)?key:null}
function encodeValue(value){
  let type;
  if(typeof value==="string")type="text";
  else if(typeof value==="number"&&Number.isFinite(value))type="number";
  else if(typeof value==="boolean")type="boolean";
  else if(value&&typeof value==="object"&&!Array.isArray(value))type="json";
  else return {ok:false,error:"unsupported_memory_value"};
  const json=JSON.stringify(value);
  if(new TextEncoder().encode(json).byteLength>MAX_VALUE_BYTES)return {ok:false,error:"memory_value_too_large"};
  return {ok:true,type,json};
}
function decodeValue(row){try{return JSON.parse(String(row?.value_json||"null"))}catch{return null}}
function publicItem(row){
  return frozen({
    id:clean(row?.id,120),
    namespace:clean(row?.namespace,40),
    key:clean(row?.memory_key,80),
    value:decodeValue(row),
    valueType:clean(row?.value_type,20),
    sourceKind:"owner_confirmed",
    confidence:Number(row?.confidence??1),
    authoritative:false,
    createdAt:row?.created_at||null,
    updatedAt:row?.updated_at||null
  });
}
export async function listBusinessMemory(env,tenantId){
  if(!env?.DB||!tenantId)return frozen({schemaReady:false,items:frozen([]),authoritative:false});
  try{
    const result=await env.DB.prepare(`SELECT id,namespace,memory_key,value_json,value_type,confidence,created_at,updated_at
      FROM business_memory_items WHERE tenant_id=? AND status='active'
      ORDER BY namespace,memory_key LIMIT 200`).bind(tenantId).all();
    return frozen({schemaReady:true,items:frozen((result.results||[]).map(publicItem)),authoritative:false,source:"owner_confirmed_business_memory"});
  }catch{
    return frozen({schemaReady:false,items:frozen([]),authoritative:false,source:"owner_confirmed_business_memory"});
  }
}
export async function confirmBusinessMemory({env,tenantId,userId,namespace,key,value,id=()=>crypto.randomUUID()}={}){
  const ns=normalizeNamespace(namespace),memoryKey=normalizeKey(key),encoded=encodeValue(value);
  if(!ns)return frozen({ok:false,error:"invalid_memory_namespace"});
  if(!memoryKey)return frozen({ok:false,error:"invalid_memory_key"});
  if(!encoded.ok)return frozen({ok:false,error:encoded.error});
  const itemId=id(),eventId=id(),valueHash=await sha256Hex(encoded.json);
  try{
    const current=await env.DB.prepare("SELECT id,value_json FROM business_memory_items WHERE tenant_id=? AND namespace=? AND memory_key=? AND status='active' LIMIT 1")
      .bind(tenantId,ns,memoryKey).first();
    const statements=[];
    if(current?.id){
      statements.push(env.DB.prepare("UPDATE business_memory_items SET status='superseded',superseded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active'")
        .bind(current.id,tenantId));
      const previousValueHash=await sha256Hex(String(current.value_json||""));
      statements.push(env.DB.prepare("INSERT INTO business_memory_events(id,tenant_id,memory_item_id,event_type,actor_user_id,value_hash) VALUES(?,?,?,?,?,?)")
        .bind(id(),tenantId,current.id,"superseded",userId||null,previousValueHash));
    }
    statements.push(env.DB.prepare(`INSERT INTO business_memory_items(
      id,tenant_id,namespace,memory_key,value_json,value_type,source_kind,confidence,status,created_by_user_id
    ) VALUES(?,?,?,?,?,?,'owner_confirmed',1.0,'active',?)`).bind(itemId,tenantId,ns,memoryKey,encoded.json,encoded.type,userId||null));
    statements.push(env.DB.prepare("INSERT INTO business_memory_events(id,tenant_id,memory_item_id,event_type,actor_user_id,value_hash) VALUES(?,?,?,?,?,?)")
      .bind(eventId,tenantId,itemId,"confirmed",userId||null,valueHash));
    await env.DB.batch(statements);
    return frozen({ok:true,itemId,namespace:ns,key:memoryKey,valueHash});
  }catch{return frozen({ok:false,error:"business_memory_write_failed"})}
}
export async function removeBusinessMemory({env,tenantId,userId,itemId,id=()=>crypto.randomUUID()}={}){
  const target=clean(itemId,120);if(!target)return frozen({ok:false,error:"memory_item_required"});
  try{
    const row=await env.DB.prepare("SELECT id,value_json FROM business_memory_items WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(target,tenantId).first();
    if(!row)return frozen({ok:true,alreadyRemoved:true});
    const valueHash=await sha256Hex(String(row.value_json||""));
    await env.DB.batch([
      env.DB.prepare("UPDATE business_memory_items SET status='superseded',superseded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active'").bind(target,tenantId),
      env.DB.prepare("INSERT INTO business_memory_events(id,tenant_id,memory_item_id,event_type,actor_user_id,value_hash) VALUES(?,?,?,?,?,?)").bind(id(),tenantId,target,"removed",userId||null,valueHash)
    ]);
    return frozen({ok:true,removed:true});
  }catch{return frozen({ok:false,error:"business_memory_remove_failed"})}
}
export async function handleBusinessMemoryRequest({request,url,env,auth,json,readJson,roleAllowed,id}={}){
  if(!url.pathname.startsWith("/api/business-memory"))return null;
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(url.pathname==="/api/business-memory"&&request.method==="GET")return json(await listBusinessMemory(env,auth.tenant_id));
  if(url.pathname==="/api/business-memory"&&request.method==="POST"){
    let body;try{body=await readJson(request)}catch(error){return json({error:error?.message||"invalid_json"},400)}
    const result=await confirmBusinessMemory({env,tenantId:auth.tenant_id,userId:auth.user_id,namespace:body?.namespace,key:body?.key,value:body?.value,id});
    return result.ok?json(result,201):json({error:result.error},result.error==="business_memory_write_failed"?503:400);
  }
  const match=url.pathname.match(/^\/api\/business-memory\/([a-zA-Z0-9-]{8,120})$/);
  if(match&&request.method==="DELETE"){
    const result=await removeBusinessMemory({env,tenantId:auth.tenant_id,userId:auth.user_id,itemId:match[1],id});
    return result.ok?json(result):json({error:result.error},503);
  }
  return json({error:"not_found"},404);
}
export const __businessMemoryTest=frozen({normalizeNamespace,normalizeKey,encodeValue});
