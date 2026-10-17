const MAX_REQUEST_BYTES=9*1024*1024;
const MAX_ATTACHMENTS_PER_SUBMISSION=3;
const MAX_ATTACHMENT_BYTES=3*1024*1024;
const MAX_TOTAL_ATTACHMENT_BYTES=6*1024*1024;
const MAX_REPORT_ATTACHMENTS=12;
const MAX_REPORT_ATTACHMENT_BYTES=24*1024*1024;
const ATTACHMENT_PREFIX="daily-report-attachments";
const GRANT_TTL_MS=10*60*1000;
const ALLOWED_TYPES=new Map([
  ["image/jpeg",[".jpg",".jpeg"]],
  ["image/png",[".png"]],
  ["image/webp",[".webp"]],
  ["application/pdf",[".pdf"]]
]);

function jsonResponse(payload,status=200,baseHeaders=null){
  const headers=new Headers(baseHeaders||undefined);
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  headers.set("x-content-type-options","nosniff");
  headers.delete("content-length");
  return new Response(JSON.stringify(payload),{status,headers});
}
function attachmentError(code,message,status=400){return jsonResponse({ok:false,error:code,code,message},status)}
function safeDecode(value){try{return decodeURIComponent(value)}catch{return ""}}
export async function reportAttachmentPrefix(reportId){return `${ATTACHMENT_PREFIX}/${await sha256Hex(new TextEncoder().encode(String(reportId)))}/`}
async function manifestKey(reportId){return `${await reportAttachmentPrefix(reportId)}manifest.json`}
function extensionFor(type){return type==="image/jpeg"?"jpg":type==="image/png"?"png":type==="image/webp"?"webp":"pdf"}
function safeFilename(name,type){
  const fallback=`attachment.${extensionFor(type)}`;
  const value=String(name||fallback).replace(/[\u0000-\u001f\u007f]/g,"").replace(/[\\/]/g,"-").trim().slice(0,120);
  return value||fallback;
}
function filenameMatchesType(name,type){
  const lower=String(name||"").toLowerCase();
  return (ALLOWED_TYPES.get(type)||[]).some(ext=>lower.endsWith(ext));
}
function magicMatches(bytes,type){
  if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==="image/png")return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if(type==="image/webp")return bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
  if(type==="application/pdf")return bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;
  return false;
}
function bytesToBase64Url(bytes){
  let binary="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function base64UrlToBytes(value){
  const text=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  const padded=text+"=".repeat((4-text.length%4)%4);let binary;
  try{binary=atob(padded)}catch{throw new Error("invalid_grant")}
  const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
async function grantKey(env){
  const secret=String(env?.SESSION_SECRET||"");
  if(secret.length<32)throw new Error("grant_secret_unavailable");
  return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
async function issueAttachmentGrant(env,reportId){
  const nonce=bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload={v:1,reportId:String(reportId),exp:Date.now()+GRANT_TTL_MS,nonce};
  const encoded=bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key=await grantKey(env);
  const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(encoded)));
  return `${encoded}.${bytesToBase64Url(signature)}`;
}
async function verifyAttachmentGrant(env,token){
  const parts=String(token||"").split(".");if(parts.length!==2)throw new Error("invalid_grant");
  const key=await grantKey(env);const signed=new TextEncoder().encode(parts[0]);const signature=base64UrlToBytes(parts[1]);
  if(!await crypto.subtle.verify("HMAC",key,signature,signed))throw new Error("invalid_grant");
  let payload;try{payload=JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])))}catch{throw new Error("invalid_grant")}
  if(payload?.v!==1||!payload.reportId||!payload.nonce||!Number.isFinite(payload.exp)||payload.exp<Date.now())throw new Error("invalid_grant");
  return payload;
}
function decodeBase64Strict(value){
  const data=String(value||"");
  if(!data||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error("invalid_base64");
  if(data.length>Math.ceil(MAX_ATTACHMENT_BYTES/3)*4+4)throw new Error("attachment_too_large");
  let binary;try{binary=atob(data)}catch{throw new Error("invalid_base64")}
  if(binary.length>MAX_ATTACHMENT_BYTES)throw new Error("attachment_too_large");
  const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function readRequestTextLimited(request,maxBytes){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error("request_too_large");
  if(!request.body)return "";
  const reader=request.body.getReader();const chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;
      if(total>maxBytes){try{await reader.cancel()}catch{}throw new Error("request_too_large")}
      chunks.push(value);
    }
  }finally{try{reader.releaseLock()}catch{}}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder().decode(merged);
}
async function parseAttachment(input){
  if(!input||typeof input!=="object")throw new Error("invalid_attachment");
  const type=String(input.type||"").toLowerCase();if(!ALLOWED_TYPES.has(type))throw new Error("type_not_allowed");
  const name=safeFilename(input.name,type);if(!filenameMatchesType(name,type))throw new Error("extension_mismatch");
  const bytes=decodeBase64Strict(input.data);
  if(input.size!==undefined&&Number(input.size)!==bytes.byteLength)throw new Error("size_mismatch");
  if(!magicMatches(bytes,type))throw new Error("signature_mismatch");
  const sha256=await sha256Hex(bytes);
  return {id:sha256.slice(0,24),name,type,size:bytes.byteLength,source:input.source==="camera"?"camera":"file",sha256,bytes};
}
async function readManifest(env,reportId){
  const object=await env.EVIDENCE.get(await manifestKey(reportId));
  if(!object)return {version:1,reportId:String(reportId),attachments:[],used_grants:[],etag:null};
  let data;try{data=JSON.parse(await object.text())}catch{throw new Error("manifest_unreadable")}
  if(data?.deleted===true)return {deleted:true,attachments:[],used_grants:[],etag:object.etag};
  if(!Array.isArray(data?.attachments))throw new Error("manifest_unreadable");
  if(!object.etag)throw new Error("manifest_version_unavailable");
  return {version:1,reportId:String(reportId),attachments:data.attachments,used_grants:Array.isArray(data.used_grants)?data.used_grants:[],inflight:data.inflight||null,etag:object.etag};
}
async function writeManifest(env,reportId,data,etag){
  const key=await manifestKey(reportId),encoded=JSON.stringify(data);
  const options={httpMetadata:{contentType:"application/json"},onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"}};
  let result;
  try{result=await env.EVIDENCE.put(key,encoded,options)}catch(error){
    const current=await env.EVIDENCE.get(key);
    if(!current||await current.text()!==encoded)throw error;
    result=current;
  }
  if(!result?.etag)throw new Error("report_attachment_upload_conflict");
  return result.etag;
}
async function uploadReportOwner(env,reportId){
  if(!env?.DB)throw new Error("report_attachment_authority_unavailable");
  return env.DB.prepare(`SELECT r.tenant_id FROM daily_employee_reports r
    WHERE r.id=? AND NOT EXISTS(SELECT 1 FROM deletion_requests d WHERE d.tenant_id=r.tenant_id
      AND d.status IN ('approved','processing','failed','blocked')) LIMIT 1`).bind(String(reportId)).first();
}
async function removeUnreferencedObjects(env,reportId,attachments=[]){
  const keep=new Set([await manifestKey(reportId),...attachments.map(item=>item.key)]);
  const page=await env.EVIDENCE.list({prefix:await reportAttachmentPrefix(reportId),limit:100});
  const keys=(page.objects||[]).map(item=>item.key).filter(key=>!keep.has(key));
  if(keys.length)await env.EVIDENCE.delete(keys);
  return {done:!page.truncated,objectsDeleted:keys.length};
}

// Invoked only by the existing claimed, legal-hold-aware tenant deletion path.
// Hash-only markers contain no tenant ID, report ID, filenames or file content.
export async function purgeDailyReportAttachments(env,{tenantId,requestId,claimToken}){
  async function authority(){
    const claim=await env.DB.prepare("SELECT id FROM deletion_requests WHERE id=? AND tenant_id=? AND status='processing' AND processing_token=?").bind(requestId,tenantId,claimToken).first();
    if(!claim)throw new Error("report_attachment_deletion_claim_lost");
    const hold=await env.DB.prepare("SELECT id FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1 LIMIT 1").bind(tenantId).first();
    if(hold)throw new Error("report_attachment_legal_hold_active");
  }
  await authority();
  const first=await env.DB.prepare("SELECT id FROM daily_employee_reports WHERE tenant_id=? ORDER BY id LIMIT 1").bind(tenantId).first();
  if(!first)return {done:true,objectsDeleted:0};
  if(!env?.EVIDENCE)throw new Error("report_attachment_storage_unavailable");
  const progressKey=`daily-report-attachment-deletions/${await sha256Hex(new TextEncoder().encode(String(tenantId)))}`;
  const previous=await env.EVIDENCE.get(progressKey);
  const progress=previous?JSON.parse(await previous.text()):{};
  if(progress.done===true)return {done:true,objectsDeleted:Number(progress.objectsDeleted||0)};
  const reports=await env.DB.prepare("SELECT id FROM daily_employee_reports WHERE tenant_id=? AND id>? ORDER BY id LIMIT 2").bind(tenantId,String(progress.cursor||"")).all();
  let total=Number(progress.objectsDeleted||0),cursor=String(progress.cursor||"");
  for(const report of reports.results||[]){
    await authority();
    const storedManifest=await env.EVIDENCE.get(await manifestKey(report.id));
    await writeManifest(env,report.id,{deleted:true},storedManifest?.etag||null);
    await authority();
    const cleanup=await removeUnreferencedObjects(env,report.id);total+=cleanup.objectsDeleted;
    if(cleanup.done)cursor=report.id;
    await env.EVIDENCE.put(progressKey,JSON.stringify({cursor,objectsDeleted:total}),{httpMetadata:{contentType:"application/json"}});
    if(!cleanup.done)return {done:false,objectsDeleted:total};
  }
  if((reports.results||[]).length===2)return {done:false,objectsDeleted:total};
  await env.EVIDENCE.put(progressKey,JSON.stringify({done:true,objectsDeleted:total}),{httpMetadata:{contentType:"application/json"}});
  return {done:true,objectsDeleted:total};
}
function publicAttachment(item,reportId,reportDate){
  return {id:item.id,name:item.name,type:item.type,size:item.size,source:item.source,uploaded_at:item.uploaded_at,download_url:`/api/daily-reporting/attachments/${encodeURIComponent(String(reportId))}/${encodeURIComponent(String(item.id))}?date=${encodeURIComponent(String(reportDate||""))}`};
}
function collectReportObjects(value,limit=80){
  const reports=[];const seen=new Set();const stack=[value];let inspected=0;
  while(stack.length&&reports.length<limit&&inspected<6000){
    const current=stack.pop();inspected++;if(!current||typeof current!=="object")continue;
    if(!Array.isArray(current)){
      const id=typeof current.id==="string"?current.id:"";const date=current.report_date||current.reportDate;
      if(id&&date&&!seen.has(id)){seen.add(id);reports.push(current)}
    }
    for(const child of Array.isArray(current)?current:Object.values(current))if(child&&typeof child==="object")stack.push(child);
  }
  return reports;
}
function responseWithJson(original,payload){return jsonResponse(payload,original.status,original.headers)}

async function handlePublicSubmit(request,env,ctx,core){
  const wantsAttachments=request.headers.get("x-thebe-report-attachments")==="1";
  const coreResponse=await core.fetch(request,env,ctx);
  if(!wantsAttachments||!coreResponse.ok)return coreResponse;
  let coreData;try{coreData=await coreResponse.clone().json()}catch{return coreResponse}
  const reportId=coreData?.reportId||coreData?.id;if(!reportId)return coreResponse;
  if(!env?.EVIDENCE)return responseWithJson(coreResponse,{...coreData,attachmentsStored:false,attachmentError:"report_attachment_storage_unavailable"});
  try{
    if(!await uploadReportOwner(env,reportId))return responseWithJson(coreResponse,{...coreData,attachmentsStored:false,attachmentError:"report_attachment_report_unavailable"});
    const attachmentUploadGrant=await issueAttachmentGrant(env,reportId);
    return responseWithJson(coreResponse,{...coreData,attachmentsPending:true,attachmentUploadGrant,attachmentUploadExpiresInSeconds:Math.floor(GRANT_TTL_MS/1000)});
  }catch{return responseWithJson(coreResponse,{...coreData,attachmentsStored:false,attachmentError:"report_attachment_grant_unavailable"})}
}

async function handlePublicAttachmentUpload(request,env){
  if(!env?.EVIDENCE)return attachmentError("report_attachment_storage_unavailable","Attachment storage is temporarily unavailable.",503);
  const grantToken=String(request.headers.get("x-report-attachment-grant")||"");let grant;
  try{grant=await verifyAttachmentGrant(env,grantToken)}catch{return attachmentError("report_attachment_grant_invalid","Attachment upload authorization is invalid or expired.",401)}
  try{if(!await uploadReportOwner(env,grant.reportId))return attachmentError("report_attachment_report_unavailable","This report no longer accepts attachments.",409)}catch{return attachmentError("report_attachment_authority_unavailable","Attachment access could not be verified.",503)}
  if(!env?.PUBLIC_RATE_LIMITER)return attachmentError("report_attachment_rate_limit_unavailable","Attachment upload protection is unavailable.",503);
  try{
    const limited=await env.PUBLIC_RATE_LIMITER.limit({key:`report-attachment:${grant.reportId}:${grant.nonce}`});
    if(!limited?.success)return attachmentError("report_attachment_rate_limited","Too many attachment upload attempts. Submit the report again to get a fresh upload authorization.",429);
  }catch{return attachmentError("report_attachment_rate_limit_unavailable","Attachment upload protection is unavailable.",503)}
  let manifest;
  try{manifest=await readManifest(env,grant.reportId)}catch{return attachmentError("report_attachment_manifest_unavailable","Attachment storage metadata is unavailable.",503)}
  if(manifest.deleted)return attachmentError("report_attachment_report_unavailable","This report no longer accepts attachments.",409);
  if(manifest.inflight){
    if(Number(manifest.inflight.expiresAt)>Date.now())return attachmentError("report_attachment_upload_conflict","Another upload is still in progress.",409);
    try{
      manifest.etag=await writeManifest(env,grant.reportId,{version:1,attachments:manifest.attachments,used_grants:manifest.used_grants},manifest.etag);
      const cleanup=await removeUnreferencedObjects(env,grant.reportId,manifest.attachments);
      if(!cleanup.done)return attachmentError("report_attachment_cleanup_pending","Attachment recovery is continuing. Try again shortly.",503);
    }catch{return attachmentError("report_attachment_upload_conflict","Attachment recovery could not finish. Try again shortly.",409)}
  }
  if(manifest.used_grants.includes(grant.nonce))return attachmentError("report_attachment_grant_used","This attachment upload authorization has already been used.",409);

  let raw;
  try{raw=await readRequestTextLimited(request,MAX_REQUEST_BYTES)}catch(error){
    return error?.message==="request_too_large"?attachmentError("report_attachments_too_large","Attachment upload is too large.",413):attachmentError("report_attachment_upload_unreadable","Attachment upload could not be read.",400);
  }
  let body;try{body=JSON.parse(raw)}catch{return attachmentError("report_attachment_upload_invalid","Attachment upload must be valid JSON.",400)}
  const incoming=Array.isArray(body?.attachments)?body.attachments:[];
  if(!incoming.length)return attachmentError("report_attachment_required","Choose at least one attachment.",400);
  if(incoming.length>MAX_ATTACHMENTS_PER_SUBMISSION)return attachmentError("report_attachment_limit_exceeded",`Attach no more than ${MAX_ATTACHMENTS_PER_SUBMISSION} files per submission.`,413);
  const parsed=[];let totalBytes=0;
  try{
    for(const item of incoming){const attachment=await parseAttachment(item);totalBytes+=attachment.size;if(totalBytes>MAX_TOTAL_ATTACHMENT_BYTES)throw new Error("attachments_too_large");parsed.push(attachment)}
  }catch(error){
    const code=String(error?.message||"");
    if(code==="attachment_too_large")return attachmentError("report_attachment_too_large","Each attachment must be 3 MB or smaller.",413);
    if(code==="attachments_too_large")return attachmentError("report_attachments_too_large","Attachments must be 6 MB or smaller in total.",413);
    if(code==="type_not_allowed"||code==="extension_mismatch")return attachmentError("report_attachment_type_not_allowed","Only JPEG, PNG, WebP and PDF attachments are accepted.",400);
    return attachmentError("report_attachment_invalid","One attachment failed file validation.",400);
  }

  const writtenKeys=[];
  const uploadId=crypto.randomUUID();
  let reservedEtag=null;
  try{
    const existingByHash=new Map(manifest.attachments.map(item=>[String(item.sha256||""),item]));
    const next=[...manifest.attachments];let added=0,skipped=0;let existingBytes=next.reduce((sum,row)=>sum+Number(row.size||0),0);
    for(const item of parsed){
      if(existingByHash.has(item.sha256)){skipped++;continue}
      if(next.length+1>MAX_REPORT_ATTACHMENTS||existingBytes+item.size>MAX_REPORT_ATTACHMENT_BYTES)throw new Error("report_attachment_quota_exceeded");
      const key=`${await reportAttachmentPrefix(grant.reportId)}${uploadId}/${item.id}.${extensionFor(item.type)}`;
      const placeholder=await env.EVIDENCE.put(key,new Uint8Array(),{onlyIf:{etagDoesNotMatch:"*"}});
      if(!placeholder?.etag)throw new Error("report_attachment_upload_conflict");
      item.storageKey=key;item.placeholderEtag=placeholder.etag;
      writtenKeys.push(key);existingBytes+=item.size;
      const record={id:item.id,name:item.name,type:item.type,size:item.size,key,sha256:item.sha256,source:item.source,uploaded_at:new Date().toISOString()};
      next.push(record);existingByHash.set(item.sha256,record);added++;
    }
    if(!await uploadReportOwner(env,grant.reportId))throw new Error("report_attachment_upload_conflict");
    reservedEtag=await writeManifest(env,grant.reportId,{version:1,attachments:manifest.attachments,used_grants:manifest.used_grants,inflight:{id:uploadId,expiresAt:grant.exp}},manifest.etag);
    for(const item of parsed.filter(item=>item.storageKey)){
      const stored=await env.EVIDENCE.put(item.storageKey,item.bytes,{onlyIf:{etagMatches:item.placeholderEtag},httpMetadata:{contentType:item.type},customMetadata:{source:item.source,sha256:item.sha256}});
      if(!stored)throw new Error("report_attachment_upload_conflict");
    }
    const usedGrants=[...manifest.used_grants.filter(value=>value!==grant.nonce).slice(-31),grant.nonce];
    await writeManifest(env,grant.reportId,{version:1,updated_at:new Date().toISOString(),attachments:next,used_grants:usedGrants},reservedEtag);
    return jsonResponse({ok:true,reportId:String(grant.reportId),attachmentsStored:true,attachmentsAdded:added,attachmentsSkipped:skipped});
  }catch(error){
    // A transport error may follow a successful manifest commit. Re-read before
    // cleanup so an uncertain acknowledgement cannot delete referenced files.
    let cleanupSafe=error?.message==="report_attachment_upload_conflict";
    if(!cleanupSafe){
      try{
        const latest=await readManifest(env,grant.reportId);
        if(latest.used_grants.includes(grant.nonce)&&writtenKeys.every(key=>latest.attachments.some(item=>item.key===key)))
          return jsonResponse({ok:true,reportId:String(grant.reportId),attachmentsStored:true,attachmentsAdded:writtenKeys.length,attachmentsSkipped:parsed.length-writtenKeys.length});
        cleanupSafe=true;
      }catch{}
    }
    if(cleanupSafe)await Promise.allSettled(writtenKeys.map(key=>env.EVIDENCE.delete(key)));
    if(cleanupSafe&&reservedEtag){try{await writeManifest(env,grant.reportId,{version:1,attachments:manifest.attachments,used_grants:manifest.used_grants},reservedEtag)}catch{}}
    if(error?.message==="report_attachment_upload_conflict")return attachmentError("report_attachment_upload_conflict","Another upload changed this report. Refresh the report before uploading again.",409);
    if(error?.message==="report_attachment_quota_exceeded")return attachmentError("report_attachment_quota_exceeded","This report has reached its attachment limit.",413);
    return attachmentError("attachments_store_failed","The report is saved, but its attachments could not be stored. Try the attachment upload again.",503);
  }
}

async function decorateDashboard(response,env){
  if(!response.ok||!env?.EVIDENCE)return response;
  let data;try{data=await response.clone().json()}catch{return response}
  const reports=collectReportObjects(data,60);if(!reports.length)return response;
  for(const report of reports){
    try{const manifest=await readManifest(env,report.id);const date=report.report_date||report.reportDate||"";report.attachments=manifest.attachments.map(item=>publicAttachment(item,report.id,date));report.attachmentsState="ready"}catch{report.attachments=[];report.attachmentsState="unavailable"}
  }
  return responseWithJson(response,data);
}
function containsReportId(data,reportId){return collectReportObjects(data,200).some(report=>String(report.id)===String(reportId))}
function contentDisposition(name){
  const encoded=encodeURIComponent(String(name||"attachment")).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}
async function handleDownload(request,env,ctx,core,reportId,attachmentId){
  if(!env?.EVIDENCE)return attachmentError("report_attachment_storage_unavailable","Attachment storage is unavailable.",503);
  const url=new URL(request.url);
  const query=url.pathname==="/"&&url.searchParams.has("__thebe_api_path")
    ?new URLSearchParams(url.searchParams.get("__thebe_api_query")||""):url.searchParams;
  const date=String(query.get("date")||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return attachmentError("report_attachment_date_required","A valid report date is required.",400);
  const authUrl=new URL(request.url);authUrl.pathname="/api/daily-reporting/dashboard";authUrl.search="";authUrl.searchParams.set("date",date);
  const authRequest=new Request(authUrl.toString(),{method:"GET",headers:request.headers,redirect:request.redirect});
  const authResponse=await core.fetch(authRequest,env,ctx);if(!authResponse.ok)return authResponse;
  let dashboard;try{dashboard=await authResponse.json()}catch{return attachmentError("report_attachment_authorization_failed","Attachment access could not be verified.",403)}
  if(!containsReportId(dashboard,reportId))return attachmentError("report_attachment_not_found","Attachment not found.",404);
  let manifest;try{manifest=await readManifest(env,reportId)}catch{return attachmentError("report_attachment_manifest_unavailable","Attachment storage metadata is unavailable.",503)}
  const item=manifest.attachments.find(row=>String(row.id)===String(attachmentId));
  if(manifest.deleted||!item||!String(item.key||"").startsWith(await reportAttachmentPrefix(reportId)))return attachmentError("report_attachment_not_found","Attachment not found.",404);
  const object=await env.EVIDENCE.get(item.key);if(!object)return attachmentError("report_attachment_not_found","Attachment not found.",404);
  const headers=new Headers();headers.set("content-type",String(item.type||"application/octet-stream"));headers.set("content-disposition",contentDisposition(item.name));headers.set("x-content-type-options","nosniff");headers.set("cache-control","private, no-store");if(Number(item.size)>0)headers.set("content-length",String(item.size));
  return new Response(object.body,{status:200,headers});
}

export default function withReportAttachments(core,{logicalRequestPath=request=>new URL(request.url).pathname}={}){
  if(!core||typeof core.fetch!=="function")throw new Error("report_attachment_core_unavailable");
  return {
    async fetch(request,env,ctx){
      const path=logicalRequestPath(request);
      if(request.method==="POST"&&path==="/public/daily-reporting/submit")return handlePublicSubmit(request,env,ctx,core);
      if(request.method==="POST"&&path==="/public/daily-reporting/attachments")return handlePublicAttachmentUpload(request,env);
      if(request.method==="GET"&&path==="/api/daily-reporting/dashboard")return decorateDashboard(await core.fetch(request,env,ctx),env);
      if(request.method==="GET"){
        const match=path.match(/^\/api\/daily-reporting\/attachments\/([^/]+)\/([^/]+)$/);
        if(match){const reportId=safeDecode(match[1]);const attachmentId=safeDecode(match[2]);if(!reportId||!attachmentId)return attachmentError("report_attachment_not_found","Attachment not found.",404);return handleDownload(request,env,ctx,core,reportId,attachmentId)}
      }
      return core.fetch(request,env,ctx);
    },
    async scheduled(controller,env,ctx){return typeof core.scheduled==="function"?core.scheduled(controller,env,ctx):undefined}
  };
}
