/** Unmounted, default-OFF per-tenant and per-actor AI export admission.
 * One atomic D1 statement prevents concurrent requests exceeding the hourly cap.
 * This module registers no HTTP routes, migrations, schedules or UI controls.
 */
import {validateAiExportRequest} from "./ai-document-export-policy.js";
const validId=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
const HOUR_MS=60*60*1000;
const upsert="INSERT INTO ai_document_export_quota (tenant_id,actor_id,window_start,used) VALUES (?,?,?,1) ON CONFLICT(tenant_id,actor_id,window_start) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used";
const unavailable=()=>({allowed:false,reason:"export_disabled"});
export function createAiExportD1Quota({db,clock=()=>Date.now(),maxPerHour=6,enabled=false}={}){
 if(enabled!==true)return Object.freeze({enabled:false,admit:async()=>unavailable()});
 if(!db||typeof db.prepare!=="function"||typeof clock!=="function"||
    !Number.isSafeInteger(maxPerHour)||maxPerHour<1||maxPerHour>20)
  throw new TypeError("private_export_quota_dependencies_required");
 return Object.freeze({enabled:true,async admit(context){
  if(context?.authenticated!==true||context?.workspaceMember!==true||
     !validId(context.tenantId)||!validId(context.actorId))
   return {allowed:false,reason:"unauthorized"};
  const now=clock();
  if(!Number.isSafeInteger(now)||now<0)return {allowed:false,reason:"storage_unavailable"};
  const windowStart=Math.floor(now/HOUR_MS)*HOUR_MS;
  try{
   const row=await db.prepare(upsert).bind(context.tenantId,context.actorId,windowStart,maxPerHour).first();
   if(row===null||row===undefined)return {allowed:false,reason:"rate_limited"};
   if(!Number.isSafeInteger(row.used)||row.used<1||row.used>maxPerHour)return {allowed:false,reason:"storage_unavailable"};
   return {allowed:true,reason:"admitted",remaining:maxPerHour-row.used};
  }catch{return {allowed:false,reason:"storage_unavailable"}}
 }});
}
/** Wrap an authenticated export service. Deny before expensive message loads/renders. */
export function createQuotaBoundedAiExportService({service,quota,enabled=false}={}){
 if(!service||typeof service.create!=="function"||typeof service.download!=="function"||
    !quota||typeof quota.admit!=="function")
  throw new TypeError("export_service_quota_required");
 return Object.freeze({
  async create(request,context){
   if(enabled!==true||quota.enabled!==true)return {ok:false,reason:"export_disabled"};
   const check=validateAiExportRequest(request,context);
   if(!check.ok)return check;
   let admission;
   try{admission=await quota.admit(context)}catch{return {ok:false,reason:"storage_unavailable"}}
   if(admission?.allowed!==true)return {ok:false,reason:admission?.reason==="rate_limited"?"rate_limited":"storage_unavailable"};
   try{return await service.create(request,context)}
   catch{return {ok:false,reason:"export_unavailable"}}
  },
  async download(id,context){
   if(enabled!==true||quota.enabled!==true)return {ok:false,reason:"export_disabled"};
   try{return await service.download(id,context)}catch{return {ok:false,reason:"export_unavailable"}}
  }
 });
}
