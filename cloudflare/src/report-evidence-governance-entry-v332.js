const RELEASE="20261011-report-evidence-v332";
const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const ALLOWED_CATEGORIES=new Set(["receipt","payment_proof","work_photo","other"]);
const MAX_NOTE=500,MAX_REFERENCE=160,MAX_NAME=180;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY",
    "referrer-policy":"no-referrer",
    "x-robots-tag":"noindex, nofollow",
    "x-thebe-report-evidence-release":RELEASE,
    ...headers
  }});
}
function safeText(value,max){return String(value||"").trim().slice(0,max)}
function safeName(value){return safeText(value||"evidence.bin",MAX_NAME).replace(/[^a-zA-Z0-9._ -]/g,"_").replace(/\s+/g,"_")||"evidence.bin"}
function positiveAmount(value){
  if(value==null||String(value).trim()==="")return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1000000000?Math.round(n*100)/100:null;
}
async function sha256Hex(value){
  const bytes=value instanceof ArrayBuffer?new Uint8Array(value):value instanceof Uint8Array?value:new TextEncoder().encode(String(value||""));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function originAllowed(request,env){
  const site=String(request.headers.get("sec-fetch-site")||"").toLowerCase();
  if(site&&site!=="same-origin"&&site!=="none")return false;
  const raw=String(request.headers.get("origin")||"").trim();if(!raw)return true;
  try{
    const expected=new URL(String(env.PUBLIC_ORIGIN||""));
    return expected.protocol==="https:"&&new URL(raw).origin===expected.origin;
  }catch{return false}
}
function scannerConfigured(env){
  try{
    const raw=String(env.EVIDENCE_SCAN_API_URL||"").trim(),secret=String(env.EVIDENCE_SCAN_SECRET||"");
    if(!raw||raw.includes("REPLACE_WITH_")||secret.length<32)return false;
    const url=new URL(raw);return url.protocol==="https:"&&!url.username&&!url.password;
  }catch{return false}
}
function uploadsEnabled(env){return String(env.EVIDENCE_UPLOADS_ENABLED||"false").trim().toLowerCase()==="true"}
function maxUploadBytes(env){
  const mb=Number(env.MAX_UPLOAD_MB||3.5);return Math.max(256*1024,Math.min(10*1024*1024,Math.floor((Number.isFinite(mb)&&mb>0?mb:3.5)*1024*1024)));
}
async function readBounded(request,maxBytes){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw Object.assign(new Error("file_too_large"),{status:413});
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks=[];let total=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>maxBytes){try{await reader.cancel()}catch{}throw Object.assign(new Error("file_too_large"),{status:413})}chunks.push(value)}
  }finally{try{reader.releaseLock()}catch{}}
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength}return out;
}
function signatureMatches(type,bytes){
  const b=bytes||new Uint8Array();
  if(type==="image/jpeg")return b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if(type==="image/png")return b.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>b[i]===v);
  if(type==="image/webp")return b.length>=12&&String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
  if(type==="application/pdf")return b.length>=5&&String.fromCharCode(...b.slice(0,5))==="%PDF-";
  return false;
}
function gaboroneDate(value=new Date()){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(value)}catch{return value.toISOString().slice(0,10)}
}
function validReportDate(value){
  const s=String(value||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const today=new Date(`${gaboroneDate()}T00:00:00+02:00`),date=new Date(`${s}T00:00:00+02:00`);
  if(!Number.isFinite(date.getTime()))return false;const age=Math.round((today-date)/86400000);return age>=0&&age<=3;
}
async function reporterAccess(env,token){
  const raw=String(token||"");if(raw.length<32||raw.length>128)return null;
  const hash=await sha256Hex(raw);
  return env.DB.prepare(`SELECT a.id access_id,a.tenant_id,a.employee_id,a.location_id,a.expires_at
    FROM employee_reporting_access a
    JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
    JOIN operating_locations l ON l.id=a.location_id AND l.tenant_id=a.tenant_id
    WHERE a.token_hash=? AND a.status='active' AND a.expires_at>CURRENT_TIMESTAMP
      AND lower(trim(coalesce(e.status,'')))='active' AND l.active=1 LIMIT 1`).bind(hash).first();
}
async function rateAllowed(env,key){
  if(!env.PUBLIC_RATE_LIMITER?.limit)return true;
  try{return (await env.PUBLIC_RATE_LIMITER.limit({key})).success!==false}catch{return false}
}
async function handleUpload(request,env){
  if(!originAllowed(request,env))return json({error:"origin_failed"},403);
  if(!uploadsEnabled(env))return json({error:"evidence_uploads_disabled",message:"Evidence uploads are not enabled for this release."},503,{"retry-after":"300"});
  if(!scannerConfigured(env))return json({error:"evidence_scanner_not_configured",message:"Evidence upload stays unavailable until malware scanning is configured."},503,{"retry-after":"300"});
  if(!env.DB||!env.EVIDENCE)return json({error:"evidence_storage_unavailable"},503);
  const token=String(request.headers.get("x-report-token")||"");
  const tokenKey=token?await sha256Hex(token):"missing";
  if(!(await rateAllowed(env,`report-evidence:${tokenKey}`)))return json({error:"rate_limited"},429,{"retry-after":"60"});
  const access=await reporterAccess(env,token);if(!access)return json({error:"invalid_or_expired_report_link"},401);
  const reportDate=String(request.headers.get("x-report-date")||gaboroneDate());
  if(!validReportDate(reportDate))return json({error:"invalid_report_date"},400);
  const report=await env.DB.prepare(`SELECT id FROM daily_employee_reports
    WHERE tenant_id=? AND employee_id=? AND location_id=? AND report_date=? LIMIT 1`)
    .bind(access.tenant_id,access.employee_id,access.location_id,reportDate).first();
  if(!report)return json({error:"report_required_before_evidence",message:"Submit the daily report first, then attach its evidence."},409);
  const type=String(request.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
  if(!ALLOWED_TYPES.has(type))return json({error:"unsupported_file_type",allowed:[...ALLOWED_TYPES]},415);
  const category=String(request.headers.get("x-evidence-category")||"other").trim().toLowerCase();
  if(!ALLOWED_CATEGORIES.has(category))return json({error:"invalid_evidence_category"},400);
  const amountHeader=request.headers.get("x-evidence-amount-bwp"),amount=positiveAmount(amountHeader);
  if(amountHeader!=null&&String(amountHeader).trim()!==""&&amount===null)return json({error:"invalid_evidence_amount"},400);
  const reference=safeText(request.headers.get("x-evidence-reference"),MAX_REFERENCE),note=safeText(request.headers.get("x-evidence-note"),MAX_NOTE);
  const filename=safeName(request.headers.get("x-file-name"));
  let bytes;try{bytes=await readBounded(request,maxUploadBytes(env))}catch(error){return json({error:error.message||"file_too_large",maxBytes:maxUploadBytes(env)},error.status||413)}
  if(!bytes.length)return json({error:"empty_upload"},400);
  if(!signatureMatches(type,bytes))return json({error:"file_signature_mismatch"},415);
  const evidenceId=crypto.randomUUID(),linkId=crypto.randomUUID(),sha=await sha256Hex(bytes);
  const objectKey=`tenant/${access.tenant_id}/quarantine/${evidenceId}/${filename}`;
  try{
    await env.EVIDENCE.put(objectKey,bytes,{httpMetadata:{contentType:type},customMetadata:{tenantId:access.tenant_id,evidenceId,sha256:sha,source:"daily_report"}});
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO evidence(id,tenant_id,object_key,display_name,category,content_type,expected_size,upload_status,scan_status,deletion_status,content_sha256,review_status)
        VALUES(?,?,?,?,?,?,?,'uploaded','queued','retained',?,'quarantined')`)
        .bind(evidenceId,access.tenant_id,objectKey,filename,`Daily report · ${category}`,type,bytes.byteLength,sha),
      env.DB.prepare(`INSERT INTO evidence_scan_events(id,evidence_id,tenant_id,event_type,status_before,status_after,details_json)
        VALUES(?,?,?,'QUEUED','not_scanned','queued',?)`)
        .bind(crypto.randomUUID(),evidenceId,access.tenant_id,JSON.stringify({source:"daily_report",reportId:report.id,reportDate})),
      env.DB.prepare(`INSERT INTO daily_report_evidence(id,tenant_id,report_id,evidence_id,employee_id,location_id,report_date,category,amount_bwp,reference,note,reconciliation_status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'reported')`)
        .bind(linkId,access.tenant_id,report.id,evidenceId,access.employee_id,access.location_id,reportDate,category,amount,reference,note)
    ]);
    await env.DB.prepare("UPDATE employee_reporting_access SET last_used_at=CURRENT_TIMESTAMP WHERE id=?").bind(access.access_id).run();
    return json({ok:true,evidenceId,reportId:report.id,category,amountBwp:amount,reconciliationStatus:"reported",reviewStatus:"quarantined",scanStatus:"queued"},201);
  }catch(error){
    try{await env.EVIDENCE.delete(objectKey)}catch{}
    try{await env.DB.prepare("DELETE FROM evidence WHERE id=? AND tenant_id=?").bind(evidenceId,access.tenant_id).run()}catch{}
    console.error("daily_report_evidence_upload_failed",{evidenceId,error:String(error?.message||error).slice(0,240)});
    return json({error:"evidence_upload_failed"},500);
  }
}

async function handleDailyReportEvidenceRequest({request,logicalPath,env}){
  if(logicalPath!=="/public/daily-reporting/evidence"||request.method!=="POST")return null;
  return handleUpload(request,env);
}

export {handleDailyReportEvidenceRequest,handleUpload,originAllowed,reporterAccess,scannerConfigured,signatureMatches,uploadsEnabled,validReportDate};
