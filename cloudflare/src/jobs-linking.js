const PUBLIC_JOB_TOKEN_RE=/^[A-Za-z0-9_-]{40,128}$/;
const JOB_STATUS=new Set(["received","review","interview","offer","hired","rejected","withdrawn"]);
const JOB_TRANSITIONS=Object.freeze({
  received:new Set(["review","rejected","withdrawn"]),
  review:new Set(["interview","rejected","withdrawn"]),
  interview:new Set(["offer","rejected","withdrawn"]),
  offer:new Set(["hired","rejected","withdrawn"]),
  hired:new Set([]),rejected:new Set([]),withdrawn:new Set([])
});

const clean=(value,max=200)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const html=value=>clean(value,12000).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const publicHeaders=Object.freeze({
  "content-type":"text/html; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "x-frame-options":"DENY",
  "referrer-policy":"no-referrer",
  "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=()",
  "content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
});
function htmlResponse(body,status=200){return new Response(body,{status,headers:publicHeaders})}
function publicJobPage(row,token,{message="",error=""}={}){
  const closed=String(row?.status||"")!=="open"||(row?.closes_on&&String(row.closes_on)<new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
  const notice=error?`<div class="notice bad">${html(error)}</div>`:message?`<div class="notice good">${html(message)}</div>`:"";
  const form=closed?'<div class="notice">This opening is no longer accepting applications.</div>':`
    <form method="post" action="/api/public/jobs/${encodeURIComponent(token)}/apply">
      <label>Full name<input name="fullName" maxlength="160" required autocomplete="name"></label>
      <label>Contact method<select name="contactType"><option value="phone">Phone</option><option value="email">Email</option></select></label>
      <label>Phone or email<input name="contact" maxlength="180" required autocomplete="email"></label>
      <label>Short application summary<textarea name="summary" maxlength="2000" required placeholder="Relevant experience, availability and why you are interested."></textarea></label>
      <input class="trap" aria-hidden="true" tabindex="-1" autocomplete="off" name="company" value="">
      <label class="consent"><input type="checkbox" name="consent" value="yes" required> I consent to this business using these details to assess this application.</label>
      <button type="submit">Submit application</button>
    </form>`;
  return `<!doctype html><html lang="en-BW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${html(row?.title||"Job opening")} · Thebe Desk</title><style>body{margin:0;background:#f5f7f9;color:#14202a;font:15px system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:680px;margin:0 auto;padding:34px 18px 60px}.card{background:#fff;border:1px solid #dfe5ea;border-radius:18px;padding:24px;box-shadow:0 12px 35px rgba(20,32,42,.07)}h1{font-size:28px;margin:4px 0 8px}.meta{color:#66727b;margin-bottom:20px}.desc{white-space:pre-wrap;line-height:1.55;margin:18px 0}label{display:block;font-weight:650;margin:14px 0 6px}input,select,textarea{box-sizing:border-box;width:100%;padding:11px;border:1px solid #cfd7de;border-radius:9px;font:inherit}textarea{min-height:130px}button{border:0;border-radius:9px;padding:11px 16px;background:#0b66d6;color:#fff;font-weight:750}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:500}.consent input{width:auto;margin-top:3px}.notice{padding:12px;border-radius:10px;background:#eef5ff;margin:12px 0}.notice.good{background:#eaf7ef}.notice.bad{background:#fff0ef}.fine{font-size:12px;color:#6b747c;margin-top:18px}.trap{position:absolute;left:-10000px;width:1px;height:1px}</style></head><body><main class="wrap"><div class="card"><div class="meta">Thebe Desk · Public job application</div><h1>${html(row?.title||"Job opening")}</h1><div class="meta">${html(row?.location||"Location not specified")} · ${html(String(row?.employment_type||"unspecified").replaceAll("_"," "))}${row?.closes_on?` · closes ${html(row.closes_on)}`:""}</div><div class="desc">${html(row?.description||"")}</div>${notice}${form}<div class="fine">Application data is sent to this employer's private Thebe Desk workspace. This form does not create an employee account, workspace login, score or automated hiring decision.</div></div></main></body></html>`;
}
function normalizeContact(type,value,validEmail){
  const kind=String(type||"").toLowerCase()==="email"?"email":"phone",raw=clean(value,180);
  if(kind==="email"){const email=raw.toLowerCase();return validEmail(email)?{type:"email",value:email,normalized:email}:null}
  const digits=raw.replace(/\D/g,"");
  let phone=digits;if(phone.startsWith("267")&&phone.length>=10)phone=phone.slice(3);
  if(phone.length<7||phone.length>12)return null;
  return {type:"phone",value:raw,normalized:phone};
}
async function jobFromToken(env,token,sha256Hex){
  const raw=String(token||"");if(!PUBLIC_JOB_TOKEN_RE.test(raw))return null;
  const hash=await sha256Hex(raw);
  return env.DB.prepare(`SELECT j.id,j.tenant_id,j.title,j.location,j.employment_type,j.description,j.status,j.closes_on,j.created_at,t.name company_name
    FROM job_openings j JOIN tenants t ON t.id=j.tenant_id WHERE j.public_token_hash=? LIMIT 1`).bind(hash).first();
}
async function readPublicApply(request,readTextBounded){
  const type=String(request.headers.get("content-type")||"").toLowerCase();
  if(type.includes("application/json")){
    const raw=await readTextBounded(request,{maxBytes:12*1024});try{return JSON.parse(raw)}catch{return null}
  }
  if(type.includes("application/x-www-form-urlencoded")){
    const raw=await readTextBounded(request,{maxBytes:12*1024});const p=new URLSearchParams(raw);
    return {fullName:p.get("fullName"),contactType:p.get("contactType"),contact:p.get("contact"),summary:p.get("summary"),consent:p.get("consent"),company:p.get("company")};
  }
  return null;
}
export async function handlePublicJobsRequest({request,url,env,json,readTextBounded,sha256Hex,id,edgeScopedRateLimit,validEmail}){
  const page=url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{40,128})$/);
  const api=url.pathname.match(/^\/api\/public\/jobs\/([A-Za-z0-9_-]{40,128})(?:\/(apply))?$/);
  if(!page&&!api)return null;
  const token=(page||api)[1],rate=await edgeScopedRateLimit(request,env,"public-job",token);if(!rate.ok)return json({error:"rate_limited"},429,{"retry-after":String(rate.retryAfterSeconds||60)});
  const job=await jobFromToken(env,token,sha256Hex);
  if(!job)return page?htmlResponse("<!doctype html><title>Job not found</title><p>This job link is invalid or unavailable.</p>",404):json({error:"job_not_found"},404);
  if(page&&request.method==="GET")return htmlResponse(publicJobPage(job,token));
  if(api&&request.method==="GET")return json({job:{title:job.title,companyName:job.company_name,location:job.location,employmentType:job.employment_type,description:job.description,status:job.status,closesOn:job.closes_on}});
  if(api&&api[2]==="apply"&&request.method==="POST"){
    const applyRate=await edgeScopedRateLimit(request,env,"public-job-apply",token);if(!applyRate.ok)return json({error:"rate_limited"},429,{"retry-after":String(applyRate.retryAfterSeconds||60)});
    const body=await readPublicApply(request,readTextBounded);if(!body)return json({error:"unsupported_application_body"},415);
    if(clean(body.company,80))return htmlResponse(publicJobPage(job,token,{message:"Application received."}),202);
    const fullName=clean(body.fullName,160),summary=clean(body.summary,2000),contact=normalizeContact(body.contactType,body.contact,validEmail);
    if(fullName.length<2||summary.length<20||!contact||String(body.consent||"")!=="yes"){
      const msg="Please provide your name, valid contact details, a short summary of at least 20 characters, and consent.";
      return String(request.headers.get("content-type")||"").includes("form-urlencoded")?htmlResponse(publicJobPage(job,token,{error:msg}),400):json({error:"invalid_application"},400);
    }
    if(job.status!=="open")return htmlResponse(publicJobPage(job,token,{error:"This opening is closed."}),409);
    const contactHash=await sha256Hex(`${contact.type}:${contact.normalized}`),applicationId=id();
    try{
      await env.DB.prepare(`INSERT INTO job_applications(id,tenant_id,job_id,full_name,contact_type,contact_value,contact_hash,summary,status)
        VALUES(?,?,?,?,?,?,?,?,'received')`).bind(applicationId,job.tenant_id,job.id,fullName,contact.type,contact.value,contactHash,summary).run();
    }catch(error){
      if(/UNIQUE/i.test(String(error?.message||error)))return htmlResponse(publicJobPage(job,token,{message:"An application with these contact details has already been received for this opening."}),200);
      if(/job_opening_not_accepting_applications/i.test(String(error?.message||error)))return htmlResponse(publicJobPage(job,token,{error:"This opening is no longer accepting applications."}),409);
      throw error;
    }
    return String(request.headers.get("content-type")||"").includes("form-urlencoded")
      ?htmlResponse(publicJobPage(job,token,{message:"Application received. The employer will contact you if they want to continue the process."}),201)
      :json({ok:true,applicationId,status:"received"},201);
  }
  return json({error:"method_not_allowed"},405,{"allow":api?.[2]==="apply"?"POST":"GET"});
}
function publicUrl(env,token,validPublicAppUrl){
  const app=validPublicAppUrl(env.PUBLIC_APP_URL);if(!app)return null;return new URL(`/jobs/${token}`,app).href;
}
export async function handleJobsRequest({request,url,env,auth,json,readJson,sha256Hex,id,roleAllowed,writeAudit,randomReporterToken,validPublicAppUrl}){
  if(!url.pathname.startsWith("/api/jobs")&&!url.pathname.startsWith("/api/job-applications"))return null;
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(url.pathname==="/api/jobs"&&request.method==="GET"){
    const rows=await env.DB.prepare(`SELECT j.id,j.title,j.location,j.employment_type,j.description,j.status,j.closes_on,j.created_at,j.updated_at,
      COUNT(a.id) application_count,SUM(CASE WHEN a.status IN ('review','interview','offer') THEN 1 ELSE 0 END) active_pipeline_count
      FROM job_openings j LEFT JOIN job_applications a ON a.job_id=j.id AND a.tenant_id=j.tenant_id
      WHERE j.tenant_id=? GROUP BY j.id ORDER BY CASE j.status WHEN 'open' THEN 0 ELSE 1 END,j.created_at DESC LIMIT 100`).bind(auth.tenant_id).all();
    return json({items:rows.results||[],policy:{aiCandidateScoring:false,automaticHiring:false,employeeAccessOnHire:false}});
  }
  if(url.pathname==="/api/jobs"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:12*1024}),title=clean(body.title,140),location=clean(body.location,120),description=clean(body.description,3000),employmentType=["permanent","fixed_term","part_time","temporary","internship"].includes(String(body.employmentType||""))?String(body.employmentType):"unspecified",closesOn=body.closesOn?String(body.closesOn):null;
    if(title.length<3||description.length<20)return json({error:"job_title_and_description_required"},400);
    if(closesOn&&!/^\d{4}-\d{2}-\d{2}$/.test(closesOn))return json({error:"invalid_closes_on"},400);
    const rawToken=randomReporterToken(),tokenHash=await sha256Hex(rawToken),jobId=id();
    await env.DB.prepare(`INSERT INTO job_openings(id,tenant_id,title,location,employment_type,description,status,closes_on,public_token_hash,created_by_user_id)
      VALUES(?,?,?,?,?,?,'open',?,?,?)`).bind(jobId,auth.tenant_id,title,location,employmentType,description,closesOn,tokenHash,auth.user_id).run();
    await writeAudit(env,auth.tenant_id,auth.user_id,"JOB_OPENING_CREATED",{jobId,title,employmentType,closesOn,publicApplicationLinkIssued:true});
    return json({ok:true,id:jobId,publicUrl:publicUrl(env,rawToken,validPublicAppUrl),publicLinkShownOnce:true},201);
  }
  const jobAction=url.pathname.match(/^\/api\/jobs\/([^/]+)\/(close|rotate-link|applications)$/);
  if(jobAction){
    const jobId=jobAction[1],action=jobAction[2],job=await env.DB.prepare("SELECT id,title,status FROM job_openings WHERE id=? AND tenant_id=? LIMIT 1").bind(jobId,auth.tenant_id).first();if(!job)return json({error:"job_not_found"},404);
    if(action==="applications"&&request.method==="GET"){
      const rows=await env.DB.prepare(`SELECT id,full_name,contact_type,contact_value,summary,status,consent_at,created_at,updated_at
        FROM job_applications WHERE tenant_id=? AND job_id=? ORDER BY created_at DESC LIMIT 500`).bind(auth.tenant_id,jobId).all();
      return json({job:{id:job.id,title:job.title,status:job.status},items:rows.results||[],policy:{aiCandidateScoring:false,automaticHiring:false,employeeAccessOnHire:false}});
    }
    if(action==="close"&&request.method==="POST"){
      await env.DB.prepare("UPDATE job_openings SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(jobId,auth.tenant_id).run();
      await writeAudit(env,auth.tenant_id,auth.user_id,"JOB_OPENING_CLOSED",{jobId,title:job.title});return json({ok:true,id:jobId,status:"closed"});
    }
    if(action==="rotate-link"&&request.method==="POST"){
      if(job.status!=="open")return json({error:"job_not_open"},409);
      const rawToken=randomReporterToken(),tokenHash=await sha256Hex(rawToken);
      await env.DB.prepare("UPDATE job_openings SET public_token_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(tokenHash,jobId,auth.tenant_id).run();
      await writeAudit(env,auth.tenant_id,auth.user_id,"JOB_PUBLIC_LINK_ROTATED",{jobId});
      return json({ok:true,id:jobId,publicUrl:publicUrl(env,rawToken,validPublicAppUrl),publicLinkShownOnce:true});
    }
  }
  const applicationAction=url.pathname.match(/^\/api\/job-applications\/([^/]+)\/status$/);
  if(applicationAction&&request.method==="POST"){
    const applicationId=applicationAction[1],body=await readJson(request,{maxBytes:4*1024}),next=String(body.status||"");
    if(!JOB_STATUS.has(next)||next==="received")return json({error:"invalid_application_status"},400);
    const row=await env.DB.prepare("SELECT id,job_id,full_name,status FROM job_applications WHERE id=? AND tenant_id=? LIMIT 1").bind(applicationId,auth.tenant_id).first();if(!row)return json({error:"application_not_found"},404);
    if(!JOB_TRANSITIONS[row.status]?.has(next))return json({error:"invalid_application_transition",from:row.status,to:next},409);
    await env.DB.prepare("UPDATE job_applications SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(next,applicationId,auth.tenant_id).run();
    await writeAudit(env,auth.tenant_id,auth.user_id,"JOB_APPLICATION_STATUS_CHANGED",{applicationId,jobId:row.job_id,from:row.status,to:next,employeeRecordCreated:false,workspaceAccessGranted:false});
    return json({ok:true,id:applicationId,status:next,employeeRecordCreated:false,workspaceAccessGranted:false});
  }
  return json({error:"not_found"},404);
}
