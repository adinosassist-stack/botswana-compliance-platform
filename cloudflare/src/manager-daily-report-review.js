// Private staging candidate. HTTP caller must enforce verified session and mutation boundaries.
const denied={status:404,error:"report_not_available"};
const actions=new Set(["acknowledge","approve","return"]);
const inviteScope=`FROM daily_employee_reports r
 JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
 JOIN operating_locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id AND l.active=1
 WHERE r.tenant_id=? AND r.id=? AND EXISTS (
 SELECT 1 FROM memberships m JOIN workspace_manager_location_grants g
 ON g.tenant_id=m.tenant_id AND g.manager_user_id=m.user_id AND g.status='active' AND g.location_id=r.location_id
 WHERE m.tenant_id=r.tenant_id AND m.user_id=? AND m.role='manager' AND m.status='active'
 AND EXISTS (SELECT 1 FROM workspace_manager_invites i WHERE i.tenant_id=m.tenant_id AND i.accepted_by_user_id=m.user_id AND i.status='accepted'))`;
export function createManagerDailyReportReview({db,id=()=>crypto.randomUUID(),allowProvisioned=false}={}){
 const scopeSql=allowProvisioned?inviteScope.replace("AND EXISTS (SELECT 1 FROM workspace_manager_invites i WHERE i.tenant_id=m.tenant_id AND i.accepted_by_user_id=m.user_id AND i.status='accepted')","AND (EXISTS (SELECT 1 FROM workspace_manager_invites i WHERE i.tenant_id=m.tenant_id AND i.accepted_by_user_id=m.user_id AND i.status='accepted') OR EXISTS (SELECT 1 FROM workspace_manager_access_requests q WHERE q.tenant_id=m.tenant_id AND q.requester_user_id=m.user_id AND q.status='provisioned'))"):inviteScope;
 if(!db||typeof db.prepare!=="function")throw new TypeError("d1_binding_required");
 function identityValid(actor){return actor?.role==="manager"&&typeof actor.tenantId==="string"&&!!actor.tenantId&&typeof actor.userId==="string"&&!!actor.userId}
 async function inspect(actor,reportId){
  if(!identityValid(actor)||typeof reportId!=="string"||!reportId||reportId.length>128)return denied;
  const row=await db.prepare("SELECT r.id,r.revision_count "+scopeSql).bind(actor.tenantId,reportId,actor.userId).first();
  if(!row)return denied;
  const events=await db.prepare("SELECT v.action,v.note,v.revision_no,v.created_at FROM daily_report_manager_reviews v JOIN daily_employee_reports r ON r.id=v.report_id AND r.tenant_id=v.tenant_id WHERE v.tenant_id=? AND v.report_id=? AND v.revision_no=? AND EXISTS (SELECT 1 "+scopeSql+") ORDER BY v.created_at,v.id").bind(actor.tenantId,reportId,row.revision_count,actor.tenantId,reportId,actor.userId).all();
  const items=events.results||[];
  const final=items.find(x=>x.action==="approve"||x.action==="return");
  return {status:200,reportId:row.id,revision:Number(row.revision_count),reviewStatus:final?.action==="approve"?"approved":final?.action==="return"?"correction_requested":items.some(x=>x.action==="acknowledge")?"acknowledged":"pending",events:items};
 }
 async function decide(actor,input){
  if(!identityValid(actor))return denied;
  const {reportId,expectedRevision,action}=input||{};
  const note=typeof input?.note==="string"?input.note.trim():"";
  if(typeof reportId!=="string"||!reportId||reportId.length>128||!Number.isInteger(expectedRevision)||expectedRevision<0||!actions.has(action)||note.length>1000||action==="return"&&note.length<5)return {status:400,error:"invalid_report_review"};
  const current=await db.prepare("SELECT r.id,r.revision_count "+scopeSql).bind(actor.tenantId,reportId,actor.userId).first();
  if(!current)return denied;
  if(Number(current.revision_count)!==expectedRevision)return {status:409,error:"report_revision_changed"};
  // The write rechecks the report revision, membership, invitation and grant in the same SQL statement.
  const inserted=await db.prepare("INSERT INTO daily_report_manager_reviews(id,tenant_id,report_id,revision_no,manager_user_id,action,note) SELECT ?,r.tenant_id,r.id,r.revision_count,?,?,? "+scopeSql+" AND r.revision_count=? AND NOT EXISTS (SELECT 1 FROM daily_report_manager_reviews v WHERE v.tenant_id=r.tenant_id AND v.report_id=r.id AND v.revision_no=r.revision_count AND (v.action IN ('approve','return') OR v.action=?)) ON CONFLICT DO NOTHING RETURNING id").bind(id(),actor.userId,action,note,actor.tenantId,reportId,actor.userId,expectedRevision,action).first();
  if(inserted)return {status:201,reportId,revision:expectedRevision,action};
  const fresh=await db.prepare("SELECT r.id,r.revision_count "+scopeSql).bind(actor.tenantId,reportId,actor.userId).first();
  if(!fresh)return denied;
  if(Number(fresh.revision_count)!==expectedRevision)return {status:409,error:"report_revision_changed"};
  const replay=await db.prepare("SELECT v.id FROM daily_report_manager_reviews v WHERE v.tenant_id=? AND v.report_id=? AND v.revision_no=? AND v.manager_user_id=? AND v.action=? AND v.note=? AND EXISTS (SELECT 1 "+scopeSql+")").bind(actor.tenantId,reportId,expectedRevision,actor.userId,action,note,actor.tenantId,reportId,actor.userId).first();
  return replay?{status:200,reportId,revision:expectedRevision,action,idempotent:true}:{status:409,error:"report_review_already_decided"};
 }
 return {inspect,decide};
}

export function managerDailyReviewEnabled(env){
 return String(env.APP_ENV||"").toLowerCase()==="staging"&&["MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED","MANAGER_INVITATIONS_SCHEMA_READY","MANAGER_INVITATIONS_ACCESS_READY","MANAGER_DAILY_REPORT_REVIEW_ENABLED","MANAGER_DAILY_REPORT_REVIEW_SCHEMA_READY"].every(k=>String(env[k]||"").toLowerCase()==="true");
}
export async function readStaffDailyReviewNotices(db,tenantId,employeeId){
 const result=await db.prepare("SELECT v.report_id,v.revision_no,v.action,v.note,v.created_at FROM daily_report_manager_reviews v JOIN daily_employee_reports r ON r.id=v.report_id AND r.tenant_id=v.tenant_id AND r.revision_count=v.revision_no JOIN operating_locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.employee_id=? ORDER BY v.created_at DESC,v.id DESC LIMIT 90").bind(tenantId,employeeId).all();
 return result.results||[];
}

export async function readOwnerDailyReviewOverview(db,{tenantId,userId,role,date,locationId=null}={}){
 if(role!=="owner"||!tenantId||!userId||typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {available:false};
 const membership=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active' LIMIT 1").bind(tenantId,userId).first();
 if(!membership?.ok)return {available:false};
 const rows=await db.prepare(`SELECT r.id,r.report_date,r.location_id,l.name location_name,e.full_name employee_name,r.revision_count,
 CASE WHEN EXISTS(SELECT 1 FROM daily_report_manager_reviews v WHERE v.tenant_id=r.tenant_id AND v.report_id=r.id AND v.revision_no=r.revision_count AND v.action='approve') THEN 'approved'
 WHEN EXISTS(SELECT 1 FROM daily_report_manager_reviews v WHERE v.tenant_id=r.tenant_id AND v.report_id=r.id AND v.revision_no=r.revision_count AND v.action='return') THEN 'correction_requested'
 WHEN EXISTS(SELECT 1 FROM daily_report_manager_reviews v WHERE v.tenant_id=r.tenant_id AND v.report_id=r.id AND v.revision_no=r.revision_count AND v.action='acknowledge') THEN 'acknowledged'
 ELSE 'pending' END review_status,
 (SELECT v.note FROM daily_report_manager_reviews v WHERE v.tenant_id=r.tenant_id AND v.report_id=r.id AND v.revision_no=r.revision_count AND v.action='return' LIMIT 1) review_note
 FROM daily_employee_reports r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
 JOIN operating_locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id
 WHERE r.tenant_id=? AND r.report_date=? AND (? IS NULL OR r.location_id=?)
 AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=r.tenant_id AND m.user_id=? AND m.role='owner' AND m.status='active')
 ORDER BY l.name,e.full_name,r.id`).bind(tenantId,date,locationId,locationId,userId).all();
 const items=rows.results||[],counts={pending:0,acknowledged:0,approved:0,correction_requested:0},branches=new Map();
 for(const r of items){
  counts[r.review_status]++;
  if(!branches.has(r.location_id))branches.set(r.location_id,{locationId:r.location_id,name:r.location_name,pending:0,acknowledged:0,approved:0,correction_requested:0});
  branches.get(r.location_id)[r.review_status]++;
 }
 return {available:true,date,locationId,counts,branches:[...branches.values()],total:items.length,items:items.slice(0,100),truncated:items.length>100};
}
