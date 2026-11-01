import {DEFAULT_RUNTIME_MARKET_CODE,marketBusinessDate} from "./market-profile.js";
import {appendSealedAuditEvent} from './audit-lineage-writer.js';
const ROOT='/api/corporate-assets';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const categories=new Set(['fleet','it','machinery','furniture','other']);
const statuses=new Set(['active','maintenance','written_off','decommissioned']);
const kinds=new Set(['service','repair','insurance','warranty']);
const text=(v,max)=>typeof v==='string'&&!/[\u0000-\u001f\u007f]/.test(v)&&v.trim().length<=max?v.trim():null;
const amount=v=>Number.isSafeInteger(v)&&v>=0&&v<=999999999999;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function validateCorporateAsset(b){
 if(!b||Object.keys(b).some(k=>!['id','revision','name','category','branch','serial','custodian','acquisitionDate','acquisitionCostMinor','bookValueMinor','status'].includes(k)))return null;
 const name=text(b.name,160),branch=text(b.branch,100),serial=text(b.serial??'',100),custodian=text(b.custodian??'',160);
 if(!UUID.test(b.id)||!name||name.length<2||!branch||serial===null||custodian===null||!categories.has(b.category)||!statuses.has(b.status)||!date(b.acquisitionDate)||!amount(b.acquisitionCostMinor)||!amount(b.bookValueMinor))return null;
 return {id:b.id,name,category:b.category,branch,serial,custodian,acquisitionDate:b.acquisitionDate,acquisitionCostMinor:b.acquisitionCostMinor,bookValueMinor:b.bookValueMinor,status:b.status};
}
export function validateCorporateService(b){
 if(!b||Object.keys(b).some(k=>!['id','kind','servicedOn','dueOn','costMinor','provider','description'].includes(k)))return null;
 const provider=text(b.provider??'',160),description=text(b.description,500);
 if(!UUID.test(b.id)||!kinds.has(b.kind)||!date(b.servicedOn)||!date(b.dueOn)||b.dueOn<b.servicedOn||!amount(b.costMinor)||provider===null||!description||description.length<2)return null;
 return {id:b.id,kind:b.kind,servicedOn:b.servicedOn,dueOn:b.dueOn,costMinor:b.costMinor,provider,description};
}
async function schemaReady(DB){
 try{await DB.prepare('SELECT id,tenant_id,revision,book_value_minor FROM corporate_assets LIMIT 0').all();await DB.prepare('SELECT id,tenant_id,asset_id,due_on FROM corporate_asset_services LIMIT 0').all();return true}catch{return false}
}
// Invoked only inside the canonical Worker session/origin/CSRF and paused-access guards.
export async function handleCorporateAssets({request,url=new URL(request.url),env,auth,readJson}={}){
 const path=url.pathname;if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
 if(!auth?.tenant_id||!auth?.user_id)return json({error:'unauthenticated'},401);
 if(!['owner','manager'].includes(auth.role))return json({error:'forbidden'},403);
 const enabled=env?.THEBE_CORPORATE_ASSETS_ENABLED==='true';
 if(path===ROOT+'/status'&&request.method==='GET')return json({enabled,ready:enabled?await schemaReady(env.DB):false});
 if(!enabled)return json({error:'assets_unavailable'},404);
 if(!await schemaReady(env.DB))return json({error:'assets_not_ready'},503);
 const tenant=auth.tenant_id,businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE);
 try{
  if(path===ROOT&&request.method==='GET'){
   const after=url.searchParams.get('after')||'';if(after&&!UUID.test(after))return json({error:'invalid_cursor'},400);
   const result=await env.DB.prepare('SELECT * FROM corporate_assets WHERE tenant_id=? AND id>? ORDER BY id LIMIT 101').bind(tenant,after).all();
   const items=result.results.slice(0,100);
   const summary=await env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(book_value_minor),0) bookValueMinor,COALESCE(SUM(status='maintenance'),0) maintenance FROM corporate_assets WHERE tenant_id=?").bind(tenant).first();
   const due=await env.DB.prepare("SELECT COUNT(*) total FROM corporate_asset_services s JOIN corporate_assets a ON a.id=s.asset_id AND a.tenant_id=s.tenant_id WHERE s.tenant_id=? AND a.status IN ('active','maintenance') AND s.due_on<=date(?,'+30 days') AND s.rowid=(SELECT max(newer.rowid) FROM corporate_asset_services newer WHERE newer.tenant_id=s.tenant_id AND newer.asset_id=s.asset_id AND newer.kind=s.kind)").bind(tenant,businessDate).first();
   const distribution=await env.DB.prepare('SELECT category,COUNT(*) count FROM corporate_assets WHERE tenant_id=? GROUP BY category ORDER BY category').bind(tenant).all();
   return json({items,summary:{...summary,byCategory:distribution.results,due:due.total},nextCursor:result.results.length>100?items.at(-1).id:null});
  }
  if(path===ROOT+'/schedule'&&request.method==='GET'){
   const rows=await env.DB.prepare("SELECT s.*,a.name asset_name FROM corporate_asset_services s JOIN corporate_assets a ON a.id=s.asset_id AND a.tenant_id=s.tenant_id WHERE s.tenant_id=? AND a.status IN ('active','maintenance') AND s.rowid=(SELECT max(newer.rowid) FROM corporate_asset_services newer WHERE newer.tenant_id=s.tenant_id AND newer.asset_id=s.asset_id AND newer.kind=s.kind) ORDER BY s.due_on,s.id LIMIT 101").bind(tenant).all();
   return json({businessDate,items:rows.results.slice(0,100),truncated:rows.results.length>100});
  }
  const match=path.match(/^\/api\/corporate-assets\/([a-f0-9-]{36})(?:\/(services|history))?$/i);
  const assetId=match?.[1],action=match?.[2];
  if(match&&!UUID.test(assetId))return json({error:'asset_not_found'},404);
  if(action==='history'&&request.method==='GET'){
   const asset=await env.DB.prepare('SELECT id FROM corporate_assets WHERE tenant_id=? AND id=?').bind(tenant,assetId).first();if(!asset)return json({error:'asset_not_found'},404);
   const audit=await env.DB.prepare("SELECT event_type,event_data,occurred_at,actor_user_id FROM audit_events WHERE tenant_id=? AND entity_type='corporate_asset' AND entity_id=? ORDER BY tenant_seq DESC LIMIT 100").bind(tenant,assetId).all();
   return json({items:audit.results});
  }
  const creating=path===ROOT&&request.method==='POST',editing=match&&!action&&request.method==='PUT';
  if(creating||editing){
   const b=await readJson(request,{maxBytes:8*1024}),v=validateCorporateAsset(b);if(!v||editing&&v.id!==assetId)return json({error:'invalid_asset'},400);
   if(editing&&(!Number.isSafeInteger(b.revision)||b.revision<1))return json({error:'invalid_revision'},400);
   // Retiring or writing off an asset is an owner decision.
   const old=editing?await env.DB.prepare('SELECT * FROM corporate_assets WHERE tenant_id=? AND id=?').bind(tenant,assetId).first():null;
   if(editing&&!old)return json({error:'asset_not_found'},404);
   if(auth.role!=='owner'&&(['written_off','decommissioned'].includes(v.status)||old&&['written_off','decommissioned'].includes(old.status)||old&&(old.acquisition_cost_minor!==v.acquisitionCostMinor||old.book_value_minor!==v.bookValueMinor)))return json({error:'owner_required'},403);
   const duplicate=await env.DB.prepare("SELECT id FROM corporate_assets WHERE tenant_id=? AND ((serial<>'' AND lower(serial)=lower(?) AND id<>?) OR (id=? AND ?=1)) LIMIT 1").bind(tenant,v.serial,v.id,v.id,creating?1:0).first();
   if(duplicate)return json({error:'asset_duplicate'},409);
   const values=[v.name,v.category,v.branch,v.serial,v.custodian,v.acquisitionDate,v.acquisitionCostMinor,v.bookValueMinor,v.status];
   const mutation=creating?env.DB.prepare('INSERT INTO corporate_assets(id,tenant_id,name,category,branch,serial,custodian,acquisition_date,acquisition_cost_minor,book_value_minor,status) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM corporate_assets WHERE tenant_id=?)<1000').bind(v.id,tenant,...values,tenant):env.DB.prepare('UPDATE corporate_assets SET name=?,category=?,branch=?,serial=?,custodian=?,acquisition_date=?,acquisition_cost_minor=?,book_value_minor=?,status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND revision=?').bind(...values,v.id,tenant,b.revision);
   const event=await appendSealedAuditEvent(env,{tenantId:tenant,actorUserId:auth.user_id,eventType:creating?'CORPORATE_ASSET_CREATED':'CORPORATE_ASSET_UPDATED',entityType:'corporate_asset',entityId:v.id,eventData:{before:old,after:v,revision:creating?1:b.revision+1},mutation});
   return event.ok?json({ok:true,id:v.id,revision:creating?1:b.revision+1},creating?201:200):json({error:creating?'asset_capacity':'asset_conflict'},409);
  }
  if(action==='services'&&request.method==='POST'){
   const b=await readJson(request,{maxBytes:8*1024}),v=validateCorporateService(b);if(!v)return json({error:'invalid_service'},400);
   const mutation=env.DB.prepare("INSERT INTO corporate_asset_services(id,tenant_id,asset_id,kind,serviced_on,due_on,cost_minor,provider,description) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM corporate_assets WHERE tenant_id=? AND id=? AND status IN ('active','maintenance'))").bind(v.id,tenant,assetId,v.kind,v.servicedOn,v.dueOn,v.costMinor,v.provider,v.description,tenant,assetId);
   const result=await appendSealedAuditEvent(env,{tenantId:tenant,actorUserId:auth.user_id,eventType:'CORPORATE_ASSET_SERVICE_RECORDED',entityType:'corporate_asset',entityId:assetId,eventData:v,mutation});
   return result.ok?json({ok:true,id:v.id},201):json({error:'asset_not_active'},409);
  }
  return json({error:'method_not_allowed'},405);
 }catch(error){
  if(error?.name==='HttpError'&&[400,413,415].includes(error.status))return json({error:error.code},error.status);
  // Never disclose database/provider details or claim a mutation succeeded on audit failure.
  if(String(error).includes('audit_write_failed'))return json({error:'asset_write_failed'},503);
  return json({error:'assets_request_failed'},503);
 }
}
