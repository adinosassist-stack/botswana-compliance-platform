import releaseGovernance from "./release-governance-entry.js";

const MAX_REQUEST_BYTES=9*1024*1024;
const MAX_ATTACHMENTS_PER_SUBMISSION=3;
const MAX_ATTACHMENT_BYTES=3*1024*1024;
const MAX_TOTAL_ATTACHMENT_BYTES=6*1024*1024;
const MAX_REPORT_ATTACHMENTS=12;
const MAX_REPORT_ATTACHMENT_BYTES=24*1024*1024;
const ATTACHMENT_PREFIX="daily-report-attachments";
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
  headers.delete("content-length");
  return new Response(JSON.stringify(payload),{status,headers});
}
function attachmentError(code,message,status=400){return jsonResponse({ok:false,error:code,code,message},status)}
function safeDecode(value){try{return decodeURIComponent(value)}catch{return ""}}
function reportPrefix(reportId){return `${ATTACHMENT_PREFIX}/${encodeURIComponent(String(reportId||""))}/`}
function manifestKey(reportId){return `${reportPrefix(reportId)}manifest.json`}
function extensionFor(type){return type==="image/jpeg"?"jpg":type==="image/png"?"png":type==="image/webp"?"webp":"pdf"}
function safeFilename(name,type){
  const fallback=`attachment.${extensionFor(type)}`;
  const value=String(name||fallback).replace(/[\u0000-\u001f\u007f]/g,"").replace(/[\\/]/g,"-").trim().slice(0,120);
  return value||fallback;
}
function filenameMatchesType(name,type){
  const lower=String(name||"").toLowerCase();
  const extensions=ALLOWED_TYPES.get(type)||[];
  return extensions.some(ext=>lower.endsWith(ext));
}
function magicMatches(bytes,type){
  if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==="image/png")return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
  if(type==="image/webp")return bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
  if(type==="application/pdf")return bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;
  return false;
}
function decodeBase64Strict(value){
  const data=String(value||"");
  if(!data||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error("invalid_base64");
  const maxEncoded=Math.ceil(MAX_ATTACHMENT_BYTES/3)*4+4;
  if(data.length>maxEncoded)throw new Error("attachment_too_large");
  let binary;
  try{binary=atob(data)}catch{throw new Error("invalid_base64")}
  if(binary.length>MAX_ATTACHMENT_BYTES)throw new Error("attachment_too_large");
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function readRequestTextLimited(request,maxBytes){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error("request_too_large");
  if(!request.body)return "";
  const reader=request.body.getReader();
  const chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){try{await reader.cancel()}catch{}throw new Error("request_too_large")}
      chunks.push(value);
    }
  }finally{reader.releaseLock()}
  const merged=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder().decode(merged);
}
function forwardedRequest(original,bodyText){
  const headers=new Headers(original.headers);
  headers.delete("content-length");
  headers.set("content-type","application/json");
  return new Request(original.url,{method:"POST",headers,body:bodyText,redirect:original.redirect});
}
async function parseAttachment(input){
  if(!input||typeof input!=="object")throw new Error("invalid_attachment");
  const type=String(input.type||"").toLowerCase();
  if(!ALLOWED_TYPES.has(type))throw new Error("type_not_allowed");
  const name=safeFilename(input.name,type);
  if(!filenameMatchesType(name,type))throw new Error("extension_mismatch");
  const bytes=decodeBase64Strict(input.data);
  if(Number(input.size||bytes.byteLength)!==bytes.byteLength)throw new Error("size_mismatch");
  if(bytes.byteLength>MAX_ATTACHMENT_BYTES)throw new Error("attachment_too_large");
  if(!magicMatches(bytes,type))throw new Error("signature_mismatch");
  const sha256=await sha256Hex(bytes);
  return {id:sha256.slice(0,24),name,type,size:bytes.byteLength,source:input.source==="camera"?"camera":"file",sha256,bytes};
}
async function readManifest(env,reportId){
  if(!env?.EVIDENCE)return {version:1,reportId:String(reportId),attachments:[]};
  const object=await env.EVIDENCE.get(manifestKey(reportId));
  if(!object)return {version:1,reportId:String(reportId),attachments:[]};
  try{
    const data=JSON.parse(await object.text());
    return {version:1,reportId:String(reportId),attachments:Array.isArray(data?.attachments)?data.attachments:[]};
  }catch{return {version:1,reportId:String(reportId),attachments:[]}}
}
function publicAttachment(item,reportId,reportDate){
  const date=String(reportDate||"");
  return {
    id:item.id,
    name:item.name,
    type:item.type,
    size:item.size,
    source:item.source,
    uploaded_at:item.uploaded_at,
    download_url:`/api/daily-reporting/attachments/${encodeURIComponent(String(reportId))}/${encodeURIComponent(String(item.id))}?date=${encodeURIComponent(date)}`
  };
}
function collectReportObjects(value,limit=80){
  const reports=[];const seen=new Set();const stack=[value];let inspected=0;
  while(stack.length&&reports.length<limit&&inspected<6000){
    const current=stack.pop();inspected++;
    if(!current||typeof current!=="object")continue;
    if(!Array.isArray(current)){
      const id=typeof current.id==="string"?current.id:"";
      const date=current.report_date||current.reportDate;
      if(id&&date&&!seen.has(id)){seen.add(id);reports.push(current)}
    }
    for(const child of Array.isArray(current)?current:Object.values(current))if(child&&typeof child==="object")stack.push(child);
  }
  return reports;
}
function responseWithJson(original,payload){return jsonResponse(payload,original.status,original.headers)}

async function handlePublicSubmit(request,env,ctx){
  let raw;
  try{raw=await readRequestTextLimited(request,MAX_REQUEST_BYTES)}catch(error){
    if(error?.message==="request_too_large")return attachmentError("report_attachments_too_large","Report submission is too large.",413);
    return attachmentError("report_submission_unreadable","Report submission could not be read.",400);
  }
  let body;
  try{body=JSON.parse(raw)}catch{return releaseGovernance.fetch(forwardedRequest(request,raw),env,ctx)}
  const incoming=Array.isArray(body?.attachments)?body.attachments:[];
  if(!incoming.length){
    if(body&&typeof body==="object")delete body.attachments;
    return releaseGovernance.fetch(forwardedRequest(request,JSON.stringify(body)),env,ctx);
  }
  if(!env?.EVIDENCE)return attachmentError("report_attachment_storage_unavailable","Attachment storage is temporarily unavailable. Your report has not been submitted yet.",503);
  if(incoming.length>MAX_ATTACHMENTS_PER_SUBMISSION)return attachmentError("report_attachment_limit_exceeded",`Attach no more than ${MAX_ATTACHMENTS_PER_SUBMISSION} files per submission.`,413);
  const parsed=[];let totalBytes=0;
  try{
    for(const item of incoming){
      const attachment=await parseAttachment(item);totalBytes+=attachment.size;
      if(totalBytes>MAX_TOTAL_ATTACHMENT_BYTES)throw new Error("attachments_too_large");
      parsed.push(attachment);
    }
  }catch(error){
    const code=String(error?.message||"");
    if(code==="attachment_too_large")return attachmentError("report_attachment_too_large","Each attachment must be 3 MB or smaller.",413);
    if(code==="attachments_too_large")return attachmentError("report_attachments_too_large","Attachments must be 6 MB or smaller in total.",413);
    if(code==="type_not_allowed"||code==="extension_mismatch")return attachmentError("report_attachment_type_not_allowed","Only JPEG, PNG, WebP and PDF attachments are accepted.",400);
    return attachmentError("report_attachment_invalid","One attachment failed file validation.",400);
  }
  delete body.attachments;
  const coreResponse=await releaseGovernance.fetch(forwardedRequest(request,JSON.stringify(body)),env,ctx);
  if(!coreResponse.ok)return coreResponse;
  let coreData;
  try{coreData=await coreResponse.clone().json()}catch{return coreResponse}
  const reportId=coreData?.reportId||coreData?.id;
  if(!reportId)return coreResponse;

  const writtenKeys=[];
  try{
    const manifest=await readManifest(env,reportId);
    const existingByHash=new Map(manifest.attachments.map(item=>[String(item.sha256||""),item]));
    const next=[...manifest.attachments];let added=0,skipped=0;
    for(const item of parsed){
      if(existingByHash.has(item.sha256)){skipped++;continue}
      const projectedCount=next.length+1;
      const projectedBytes=next.reduce((sum,row)=>sum+Number(row.size||0),0)+item.size;
      if(projectedCount>MAX_REPORT_ATTACHMENTS||projectedBytes>MAX_REPORT_ATTACHMENT_BYTES)throw new Error("report_attachment_quota_exceeded");
      const key=`${reportPrefix(reportId)}${item.id}.${extensionFor(item.type)}`;
      await env.EVIDENCE.put(key,item.bytes,{httpMetadata:{contentType:item.type},customMetadata:{reportId:String(reportId),source:item.source,sha256:item.sha256}});
      writtenKeys.push(key);
      const record={id:item.id,name:item.name,type:item.type,size:item.size,key,sha256:item.sha256,source:item.source,uploaded_at:new Date().toISOString()};
      next.push(record);existingByHash.set(item.sha256,record);added++;
    }
    const nextManifest={version:1,reportId:String(reportId),updated_at:new Date().toISOString(),attachments:next};
    await env.EVIDENCE.put(manifestKey(reportId),JSON.stringify(nextManifest),{httpMetadata:{contentType:"application/json"}});
    return responseWithJson(coreResponse,{...coreData,attachmentsStored:true,attachmentsAdded:added,attachmentsSkipped:skipped});
  }catch(error){
    await Promise.allSettled(writtenKeys.map(key=>env.EVIDENCE.delete(key)));
    const quota=error?.message==="report_attachment_quota_exceeded";
    return responseWithJson(coreResponse,{...coreData,attachmentsStored:false,attachmentError:quota?"report_attachment_quota_exceeded":"attachments_store_failed",message:coreData.message||"Daily report submitted."});
  }
}

async function decorateDashboard(request,env,ctx){
  const response=await releaseGovernance.fetch(request,env,ctx);
  if(!response.ok||!env?.EVIDENCE)return response;
  let data;
  try{data=await response.clone().json()}catch{return response}
  const reports=collectReportObjects(data,60);
  if(!reports.length)return response;
  for(const report of reports){
    try{
      const manifest=await readManifest(env,report.id);
      const date=report.report_date||report.reportDate||"";
      report.attachments=manifest.attachments.map(item=>publicAttachment(item,report.id,date));
    }catch{report.attachments=[]}
  }
  return responseWithJson(response,data);
}
function containsReportId(data,reportId){return collectReportObjects(data,200).some(report=>String(report.id)===String(reportId))}
function contentDisposition(name){
  const encoded=encodeURIComponent(String(name||"attachment")).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}
async function handleDownload(request,env,ctx,reportId,attachmentId){
  if(!env?.EVIDENCE)return attachmentError("report_attachment_storage_unavailable","Attachment storage is unavailable.",503);
  const url=new URL(request.url);const date=String(url.searchParams.get("date")||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return attachmentError("report_attachment_date_required","A valid report date is required.",400);
  const authUrl=new URL(request.url);authUrl.pathname="/api/daily-reporting/dashboard";authUrl.search="";authUrl.searchParams.set("date",date);
  const authRequest=new Request(authUrl.toString(),{method:"GET",headers:request.headers,redirect:request.redirect});
  const authResponse=await releaseGovernance.fetch(authRequest,env,ctx);
  if(!authResponse.ok)return authResponse;
  let dashboard;
  try{dashboard=await authResponse.json()}catch{return attachmentError("report_attachment_authorization_failed","Attachment access could not be verified.",403)}
  if(!containsReportId(dashboard,reportId))return attachmentError("report_attachment_not_found","Attachment not found.",404);
  const manifest=await readManifest(env,reportId);
  const item=manifest.attachments.find(row=>String(row.id)===String(attachmentId));
  if(!item||!String(item.key||"").startsWith(reportPrefix(reportId)))return attachmentError("report_attachment_not_found","Attachment not found.",404);
  const object=await env.EVIDENCE.get(item.key);
  if(!object)return attachmentError("report_attachment_not_found","Attachment not found.",404);
  const headers=new Headers();
  headers.set("content-type",String(item.type||"application/octet-stream"));
  headers.set("content-disposition",contentDisposition(item.name));
  headers.set("x-content-type-options","nosniff");
  headers.set("cache-control","private, no-store");
  if(Number(item.size)>0)headers.set("content-length",String(item.size));
  return new Response(object.body,{status:200,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);const path=url.pathname;
    if(request.method==="POST"&&path==="/api/public/daily-reporting/submit")return handlePublicSubmit(request,env,ctx);
    if(request.method==="GET"&&path==="/api/daily-reporting/dashboard")return decorateDashboard(request,env,ctx);
    if(request.method==="GET"){
      const match=path.match(/^\/api\/daily-reporting\/attachments\/([^/]+)\/([^/]+)$/);
      if(match){
        const reportId=safeDecode(match[1]);const attachmentId=safeDecode(match[2]);
        if(!reportId||!attachmentId)return attachmentError("report_attachment_not_found","Attachment not found.",404);
        return handleDownload(request,env,ctx,reportId,attachmentId);
      }
    }
    return releaseGovernance.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){return releaseGovernance.scheduled(controller,env,ctx)}
};
