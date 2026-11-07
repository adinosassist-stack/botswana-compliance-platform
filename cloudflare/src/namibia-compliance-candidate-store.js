// REVIEW-ONLY repository adapter. Not imported by worker, routes, or production migration runner.
// Caller must supply already-authenticated, server-origin tenant + actor context.
// Only metadata is stored: no personal IDs, BO identities, attachments or uploaded documents.
import {parseEntityProfile, parseISODate, NAMIBIA_EVIDENCE_TYPES} from "./namibia-compliance-workflows.js";

const allowedFields=(input,allowed)=>!!input&&typeof input==="object"&&!Array.isArray(input)&&Object.keys(input).every(key=>allowed.includes(key));
const ENTITY_FIELDS=Object.freeze(["entityRef","entityType","financialYearEnd"]);
const EVIDENCE_FIELDS=Object.freeze(["entityRef","evidenceType","label","externalReference","sourceUrl"]);
const CALENDAR_FIELDS=Object.freeze(["entityRef","taskType","title","planningDate","sourceUrl"]);
const EVENT_TYPES=Object.freeze(["entity_draft_created","evidence_metadata_created","calendar_draft_created"]);
const TASK_TYPES=Object.freeze(["bipa_annual_return","bipa_beneficial_ownership","namra_vat_assessment","fic_applicability"]);
const result=(ok,valueOrError)=>Object.freeze(ok?{ok:true,value:valueOrError}:{ok:false,error:valueOrError});
const safeString=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
const validUrl=(value)=>{try{const u=new URL(value);return u.protocol==="https:"&&u.username===""&&u.password===""&&u.hostname.length>0}catch{return false}};
function principal(auth){
  if (!auth||typeof auth!=="object"||auth.marketCode!=="NA")return null;
  const tenantId=safeString(auth.tenant_id,120),actorId=safeString(auth.user_id,120);
  return tenantId&&actorId&&["owner","manager"].includes(auth.role)?{tenantId,actorId}:null;
}
function validateDb(db){return !!db&&typeof db.prepare==="function"&&typeof db.batch==="function"}
function uid(){return crypto.randomUUID()}
async function ensureEntity(db,tenantId,entityRef){
  return !!(await db.prepare("SELECT entity_ref FROM na_compliance_entities WHERE tenant_id=? AND entity_ref=? LIMIT 1")
    .bind(tenantId,entityRef).first());
}
async function atomic(db,write,audit){
  // D1 batch executes statements as a single transaction; no best-effort writes.
  return db.batch([write,audit]);
}
function common(db,auth){
  if(!validateDb(db))return result(false,"candidate_database_unavailable");
  const p=principal(auth);return p?result(true,p):result(false,"namibia_owner_or_manager_required");
}
function event(db,p,entityRef,recordId,eventType){
  if(!EVENT_TYPES.includes(eventType))throw new Error("unknown_audit_event");
  return db.prepare("INSERT INTO na_compliance_audit_events(tenant_id,event_id,entity_ref,actor_id,event_type,record_id) VALUES(?,?,?,?,?,?)")
    .bind(p.tenantId,uid(),entityRef,p.actorId,eventType,recordId);
}
export function candidateStoreCapability(){
  return Object.freeze({marketCode:"NA",productionEnabled:false,attachedToWorker:false,
    schemaPath:"proposals/namibia/001_compliance_candidate.sql",
    writesRequire:"authenticated_NA_owner_or_manager",supportsDocuments:false});
}
export async function createNamibiaEntityDraft(db,auth,input){
  const c=common(db,auth);if(!c.ok)return c;
  if(!allowedFields(input,ENTITY_FIELDS))return result(false,"unexpected_entity_fields");
  const p=parseEntityProfile(input);if(!p.valid)return result(false,p.reason);
  // Reject, rather than truncate, external refs to prevent silent collisions.
  if(!safeString(input.entityRef,64))return result(false,"invalid_entity_reference");
  const e=p.value;
  try{
    await atomic(db,
      db.prepare("INSERT INTO na_compliance_entities(tenant_id,entity_ref,entity_type,financial_year_end) VALUES(?,?,?,?)")
        .bind(c.value.tenantId,e.entityRef,e.entityType,e.financialYearEnd),
      event(db,c.value,e.entityRef,e.entityRef,"entity_draft_created")
    );
    return result(true,Object.freeze({entityRef:e.entityRef,marketCode:"NA",status:"draft"}));
  }catch{return result(false,"entity_draft_write_failed")}
}
export async function createNamibiaEvidenceMetadata(db,auth,input){
  const c=common(db,auth);if(!c.ok)return c;
  if(!input||typeof input!=="object"||Array.isArray(input))return result(false,"invalid_evidence_payload");
  if(!allowedFields(input,EVIDENCE_FIELDS))return result(false,"unexpected_evidence_fields");
  const entityRef=safeString(input.entityRef,64),type=input.evidenceType,label=safeString(input.label,160);
  if(!entityRef||!NAMIBIA_EVIDENCE_TYPES.includes(type)||!label)return result(false,"invalid_evidence_metadata");
  if(input.externalReference!==undefined&&!safeString(input.externalReference,120))return result(false,"invalid_external_reference");
  if(input.sourceUrl!==undefined&&!validUrl(input.sourceUrl))return result(false,"invalid_source_url");
  if(input.file||input.bytes||input.objectKey||input.beneficialOwnerDetails)return result(false,"sensitive_or_uploaded_evidence_not_supported");
  if(!await ensureEntity(db,c.value.tenantId,entityRef))return result(false,"entity_not_found");
  const evidenceId=uid();
  try{
    await atomic(db,
      db.prepare("INSERT INTO na_compliance_evidence(tenant_id,evidence_id,entity_ref,evidence_type,label,external_reference,source_url,created_by) VALUES(?,?,?,?,?,?,?,?)")
        .bind(c.value.tenantId,evidenceId,entityRef,type,label,input.externalReference??null,input.sourceUrl??null,c.value.actorId),
      event(db,c.value,entityRef,evidenceId,"evidence_metadata_created")
    );
    return result(true,Object.freeze({evidenceId,entityRef,status:"metadata_only",verified:false}));
  }catch{return result(false,"evidence_metadata_write_failed")}
}
export async function createNamibiaCalendarDraft(db,auth,input){
  const c=common(db,auth);if(!c.ok)return c;
  if(!input||typeof input!=="object"||Array.isArray(input))return result(false,"invalid_calendar_payload");
  if(!allowedFields(input,CALENDAR_FIELDS))return result(false,"unexpected_calendar_fields");
  const entityRef=safeString(input.entityRef,64),date=parseISODate(input.planningDate);
  const title=safeString(input.title,160);
  if(!entityRef||!date||!title||!TASK_TYPES.includes(input.taskType)||!validUrl(input.sourceUrl))return result(false,"invalid_calendar_draft");
  if(input.deadlineConfirmed===true||input.notify===true||input.submit===true)return result(false,"activation_not_authorized");
  if(!await ensureEntity(db,c.value.tenantId,entityRef))return result(false,"entity_not_found");
  const draftId=uid();
  try{
    await atomic(db,
      db.prepare("INSERT INTO na_compliance_calendar_drafts(tenant_id,draft_id,entity_ref,task_type,task_title,planning_date,source_url,created_by) VALUES(?,?,?,?,?,?,?,?)")
        .bind(c.value.tenantId,draftId,entityRef,input.taskType,title,date,input.sourceUrl,c.value.actorId),
      event(db,c.value,entityRef,draftId,"calendar_draft_created")
    );
    return result(true,Object.freeze({draftId,entityRef,planningDate:date,status:"draft",
      deadlineConfirmed:false,notificationEnabled:false,filingEnabled:false}));
  }catch{return result(false,"calendar_draft_write_failed")}
}
async function list(db,auth,query,values){
  const c=common(db,auth);if(!c.ok)return c;
  try{
    const data=await db.prepare(query).bind(c.value.tenantId,...values).all();
    return result(true,Object.freeze(data?.results||[]));
  }catch{return result(false,"candidate_read_failed")}
}
export function listNamibiaEvidenceMetadata(db,auth,entityRef){
  if(!safeString(entityRef,64))return Promise.resolve(result(false,"invalid_entity_reference"));
  return list(db,auth,
    "SELECT evidence_id,entity_ref,evidence_type,label,status,verified,created_at FROM na_compliance_evidence WHERE tenant_id=? AND entity_ref=? ORDER BY created_at DESC LIMIT 100",[entityRef]);
}
export function listNamibiaCalendarDrafts(db,auth,entityRef){
  if(!safeString(entityRef,64))return Promise.resolve(result(false,"invalid_entity_reference"));
  return list(db,auth,
    "SELECT draft_id,entity_ref,task_type,task_title,planning_date,official_deadline_confirmed,notification_enabled,filing_enabled,source_url FROM na_compliance_calendar_drafts WHERE tenant_id=? AND entity_ref=? ORDER BY planning_date ASC LIMIT 100",[entityRef]);
}
export function listNamibiaAuditEvents(db,auth,entityRef){
  if(!safeString(entityRef,64))return Promise.resolve(result(false,"invalid_entity_reference"));
  return list(db,auth,
    "SELECT event_id,entity_ref,event_type,record_id,occurred_at FROM na_compliance_audit_events WHERE tenant_id=? AND entity_ref=? ORDER BY occurred_at DESC LIMIT 100",[entityRef]);
}
