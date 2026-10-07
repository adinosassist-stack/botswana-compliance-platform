const CONTACT_CHANNELS=new Set(["whatsapp","email"]);
const CONSENT_STATUSES=new Set(["unknown","opted_in","opted_out"]);
const FOLLOWUP_PURPOSES=new Set(["receivable","quote","appointment","general"]);
const FOLLOWUP_STATUSES=new Set(["draft","approved","cancelled","queued","sent","failed"]);
const MAX_LIST=100;
const text=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

function customerContactsPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/customers\/([^/]+)\/contacts$/);
  return match?{customerId:text(match[1],64)}:null;
}
function customerFollowupsPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/customers\/([^/]+)\/followups$/);
  return match?{customerId:text(match[1],64)}:null;
}
function followupActionPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/customer-followups\/([^/]+)\/(approve|cancel)$/);
  return match?{followupId:text(match[1],64),action:match[2]}:null;
}
function normalizeEmail(value){
  const email=text(value,254).toLowerCase();
  if(!email||email.includes(" ")||email.startsWith("@")||email.endsWith("@"))return null;
  const at=email.indexOf("@");
  if(at<1||at!==email.lastIndexOf("@")||email.indexOf(".",at+2)<0)return null;
  return email;
}
function normalizeBotswanaWhatsApp(value){
  let phone=text(value,40).replace(/[\s()-]/g,"");
  if(phone.startsWith("00"))phone=`+${phone.slice(2)}`;
  if(/^7\d{7}$/.test(phone))phone=`+267${phone}`;
  if(/^2677\d{7}$/.test(phone))phone=`+${phone}`;
  return /^\+2677\d{7}$/.test(phone)?phone:null;
}
export function normalizeCustomerContact(channel,value){
  const normalizedChannel=text(channel,20).toLowerCase();
  if(!CONTACT_CHANNELS.has(normalizedChannel))return {error:"invalid_customer_contact_channel"};
  const normalizedValue=normalizedChannel==="email"?normalizeEmail(value):normalizeBotswanaWhatsApp(value);
  if(!normalizedValue)return {error:normalizedChannel==="email"?"invalid_customer_email":"invalid_customer_whatsapp"};
  return {channel:normalizedChannel,value:normalizedValue};
}
function maskContact(channel,value){
  const normalized=text(value,254);
  if(channel==="email"){
    const at=normalized.indexOf("@");
    if(at<1)return "***";
    const local=normalized.slice(0,at),domain=normalized.slice(at+1);
    return `${local.slice(0,1)}***@${domain}`;
  }
  return normalized.length>=4?`***${normalized.slice(-4)}`:"***";
}
function parseLimit(url){return Math.min(MAX_LIST,Math.max(1,Number(url?.searchParams?.get("limit")||50)||50))}
function role(auth){return text(auth?.role,40).toLowerCase()}
function owner(auth){return role(auth)==="owner"}
function contactDto(row){return {
  id:row.id,customerId:row.customer_id,channel:row.channel,maskedValue:maskContact(row.channel,row.contact_value),
  consentStatus:row.consent_status,consentSource:row.consent_source||null,consentRecordedAt:row.consent_recorded_at||null,
  status:row.status,createdAt:row.created_at,updatedAt:row.updated_at
}}
function followupDto(row){return {
  id:row.id,customerId:row.customer_id,customerName:row.customer_name||null,contactId:row.contact_id,
  channel:row.channel||null,maskedContact:row.contact_value?maskContact(row.channel,row.contact_value):null,
  consentStatus:row.consent_status||null,invoiceId:row.invoice_id||null,invoiceNumber:row.invoice_number||null,
  purpose:row.purpose,messageBody:row.message_body,preparedBy:row.prepared_by,status:row.status,
  approvedAt:row.approved_at||null,queuedAt:row.queued_at||null,sentAt:row.sent_at||null,
  failureCode:row.failure_code||null,createdAt:row.created_at,updatedAt:row.updated_at,
  executionAllowed:false
}}
async function activeCustomer(env,tenantId,customerId){
  return await env.DB.prepare("SELECT id,name,customer_code FROM finance_customers WHERE id=? AND tenant_id=? AND status='active' LIMIT 1")
    .bind(customerId,tenantId).first();
}
async function customerContact(env,tenantId,contactId){
  return await env.DB.prepare("SELECT id,customer_id,channel,contact_value,contact_hash,consent_status,consent_source,consent_recorded_at,status,created_at,updated_at FROM customer_contacts WHERE id=? AND tenant_id=? LIMIT 1")
    .bind(contactId,tenantId).first();
}
async function followupDetail(env,tenantId,followupId){
  return await env.DB.prepare(`SELECT f.*,c.name customer_name,cc.channel,cc.contact_value,cc.consent_status,i.invoice_number
    FROM customer_followups f
    JOIN finance_customers c ON c.id=f.customer_id AND c.tenant_id=f.tenant_id
    JOIN customer_contacts cc ON cc.id=f.contact_id AND cc.tenant_id=f.tenant_id
    LEFT JOIN finance_invoices i ON i.id=f.invoice_id AND i.tenant_id=f.tenant_id
    WHERE f.id=? AND f.tenant_id=? LIMIT 1`).bind(followupId,tenantId).first();
}
export async function prepareCustomerFollowup({env,auth,customerId,contactId,invoiceId=null,purpose="general",messageBody,idempotencyKey,preparedBy="human",id,sha256Hex}){
  const tenantId=String(auth?.tenant_id||""),userId=String(auth?.user_id||"");
  const normalizedPurpose=text(purpose,30).toLowerCase(),body=text(messageBody,2000),idem=text(idempotencyKey,160);
  if(!FOLLOWUP_PURPOSES.has(normalizedPurpose))return {error:"invalid_customer_followup_purpose",status:400};
  if(body.length<2)return {error:"customer_followup_message_required",status:400};
  if(idem.length<8)return {error:"idempotency_key_required",status:400};
  if(!["human","thebe"].includes(preparedBy))return {error:"invalid_customer_followup_preparer",status:400};
  const customer=await activeCustomer(env,tenantId,customerId);
  if(!customer)return {error:"finance_customer_not_found",status:404};
  const contact=await customerContact(env,tenantId,contactId);
  if(!contact||contact.customer_id!==customerId||contact.status!=="active")return {error:"customer_contact_not_found",status:404};
  let invoice=null;
  if(invoiceId){
    invoice=await env.DB.prepare("SELECT id,invoice_number,status FROM finance_invoices WHERE id=? AND tenant_id=? AND customer_id=? LIMIT 1")
      .bind(invoiceId,tenantId,customerId).first();
    if(!invoice||invoice.status!=="issued")return {error:"customer_followup_invoice_not_found",status:404};
  }
  const messageHash=await sha256Hex(JSON.stringify([tenantId,customerId,contactId,invoiceId||"",normalizedPurpose,body,preparedBy]));
  const existing=await env.DB.prepare("SELECT id,message_hash FROM customer_followups WHERE tenant_id=? AND idempotency_key=? LIMIT 1")
    .bind(tenantId,idem).first();
  if(existing){
    if(String(existing.message_hash)!==messageHash)return {error:"idempotency_key_conflict",status:409};
    const replay=await followupDetail(env,tenantId,existing.id);
    return {ok:true,replayed:true,followup:followupDto(replay)};
  }
  const followupId=id();
  try{
    await env.DB.prepare(`INSERT INTO customer_followups(
      id,tenant_id,customer_id,contact_id,invoice_id,purpose,message_body,message_hash,idempotency_key,prepared_by,status,requested_by_user_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?)`).bind(
      followupId,tenantId,customerId,contactId,invoiceId||null,normalizedPurpose,body,messageHash,idem,preparedBy,userId||null
    ).run();
  }catch(error){
    if(/unique|constraint/i.test(String(error))){
      const replay=await env.DB.prepare("SELECT id,message_hash FROM customer_followups WHERE tenant_id=? AND idempotency_key=? LIMIT 1")
        .bind(tenantId,idem).first();
      if(replay&&String(replay.message_hash)===messageHash){
        const row=await followupDetail(env,tenantId,replay.id);return {ok:true,replayed:true,followup:followupDto(row)};
      }
      return {error:"customer_followup_conflict",status:409};
    }
    throw error;
  }
  const row=await followupDetail(env,tenantId,followupId);
  return {ok:true,created:true,followup:followupDto(row),customer,contact,invoice,messageHash};
}

export async function handleCustomerRelationshipRequest({request,url,env,auth,json,readJson,id,appendLineage,writeAudit,sha256Hex}){
  const path=String(url?.pathname||"");
  if(!path.startsWith("/api/finance/"))return null;

  const contactsRoute=customerContactsPath(path);
  if(contactsRoute&&request.method==="GET"){
    const customer=await activeCustomer(env,auth.tenant_id,contactsRoute.customerId);
    if(!customer)return json({error:"finance_customer_not_found"},404);
    const rows=await env.DB.prepare(`SELECT id,customer_id,channel,contact_value,consent_status,consent_source,consent_recorded_at,status,created_at,updated_at
      FROM customer_contacts WHERE tenant_id=? AND customer_id=? ORDER BY status,channel,created_at DESC LIMIT ?`)
      .bind(auth.tenant_id,contactsRoute.customerId,parseLimit(url)).all();
    return json({customer:{id:customer.id,name:customer.name,customerCode:customer.customer_code||null},items:(rows.results||[]).map(contactDto),authority:{tenantScoped:true,customerConsentRequiredForDispatch:true}});
  }
  if(contactsRoute&&request.method==="POST"){
    const customer=await activeCustomer(env,auth.tenant_id,contactsRoute.customerId);
    if(!customer)return json({error:"finance_customer_not_found"},404);
    const body=await readJson(request,{maxBytes:16*1024}),normalized=normalizeCustomerContact(body.channel,body.value);
    if(normalized.error)return json({error:normalized.error},400);
    const consentStatus=text(body.consentStatus||"unknown",20).toLowerCase();
    if(!CONSENT_STATUSES.has(consentStatus))return json({error:"invalid_customer_consent_status"},400);
    const consentSource=text(body.consentSource,120)||null;
    if(consentStatus==="opted_in"&&!consentSource)return json({error:"customer_consent_source_required"},400);
    const contactHash=await sha256Hex(JSON.stringify([auth.tenant_id,normalized.channel,normalized.value]));
    const contactId=(await sha256Hex(JSON.stringify([auth.tenant_id,contactsRoute.customerId,normalized.channel,contactHash]))).slice(0,64);
    const existing=await customerContact(env,auth.tenant_id,contactId);
    if(existing){
      if(existing.customer_id!==contactsRoute.customerId)return json({error:"customer_contact_scope_conflict"},409);
      return json({ok:true,replayed:true,contact:contactDto(existing)});
    }
    try{
      await env.DB.prepare(`INSERT INTO customer_contacts(
        id,tenant_id,customer_id,channel,contact_value,contact_hash,consent_status,consent_source,consent_recorded_at,status,created_by_user_id
      ) VALUES(?,?,?,?,?,?,?,?,CASE WHEN ?='unknown' THEN NULL ELSE CURRENT_TIMESTAMP END,'active',?)`).bind(
        contactId,auth.tenant_id,contactsRoute.customerId,normalized.channel,normalized.value,contactHash,consentStatus,consentSource,consentStatus,auth.user_id
      ).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"customer_contact_exists_or_invalid"},409);
      throw error;
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CUSTOMER_CONTACT_CREATED",entityType:"customer_contact",entityId:contactId,payload:{customerId:contactsRoute.customerId,channel:normalized.channel,contactHash,consentStatus,consentSource},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"CUSTOMER_CONTACT_CREATED",{contactId,customerId:contactsRoute.customerId,channel:normalized.channel,consentStatus});
    const row=await customerContact(env,auth.tenant_id,contactId);
    return json({ok:true,contact:contactDto(row)},201);
  }

  const customerFollowupRoute=customerFollowupsPath(path);
  if(customerFollowupRoute&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:24*1024});
    const idempotencyKey=text(request.headers.get("idempotency-key")||body.idempotencyKey,160);
    const result=await prepareCustomerFollowup({
      env,auth,customerId:customerFollowupRoute.customerId,contactId:text(body.contactId,64),invoiceId:text(body.invoiceId,64)||null,
      purpose:body.purpose,messageBody:body.messageBody,idempotencyKey,preparedBy:"human",id,sha256Hex
    });
    if(result.error)return json({error:result.error},result.status||400);
    if(result.created){
      const f=result.followup;
      await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CUSTOMER_FOLLOWUP_PREPARED",entityType:"customer_followup",entityId:f.id,payload:{customerId:f.customerId,contactId:f.contactId,invoiceId:f.invoiceId,purpose:f.purpose,messageHash:result.messageHash,preparedBy:f.preparedBy,status:"draft"},sha256Hex,id});
      await writeAudit(env,auth.tenant_id,auth.user_id,"CUSTOMER_FOLLOWUP_PREPARED",{followupId:f.id,customerId:f.customerId,contactId:f.contactId,invoiceId:f.invoiceId,purpose:f.purpose,preparedBy:f.preparedBy});
    }
    return json({ok:true,replayed:Boolean(result.replayed),followup:result.followup,execution:{performed:false,externalSideEffect:false,dispatchEnabled:false,reason:"customer_dispatch_not_enabled"}},result.created?201:200);
  }

  if(path==="/api/finance/customer-followups"&&request.method==="GET"){
    const requestedStatus=text(url.searchParams.get("status"),20).toLowerCase();
    if(requestedStatus&&!FOLLOWUP_STATUSES.has(requestedStatus))return json({error:"invalid_customer_followup_status"},400);
    const limit=parseLimit(url);
    const sql=`SELECT f.*,c.name customer_name,cc.channel,cc.contact_value,cc.consent_status,i.invoice_number
      FROM customer_followups f
      JOIN finance_customers c ON c.id=f.customer_id AND c.tenant_id=f.tenant_id
      JOIN customer_contacts cc ON cc.id=f.contact_id AND cc.tenant_id=f.tenant_id
      LEFT JOIN finance_invoices i ON i.id=f.invoice_id AND i.tenant_id=f.tenant_id
      WHERE f.tenant_id=?${requestedStatus?" AND f.status=?":""}
      ORDER BY f.created_at DESC LIMIT ?`;
    const stmt=env.DB.prepare(sql),rows=requestedStatus?await stmt.bind(auth.tenant_id,requestedStatus,limit).all():await stmt.bind(auth.tenant_id,limit).all();
    return json({items:(rows.results||[]).map(followupDto),executionPolicy:{externalDispatchEnabled:false,ownerApprovalRequired:true,customerConsentRequired:true}});
  }

  const actionRoute=followupActionPath(path);
  if(actionRoute&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:8*1024});
    const current=await followupDetail(env,auth.tenant_id,actionRoute.followupId);
    if(!current)return json({error:"customer_followup_not_found"},404);
    if(actionRoute.action==="approve"){
      if(!owner(auth))return json({error:"owner_required"},403);
      if(body.confirm!==true)return json({error:"explicit_customer_followup_confirmation_required"},400);
      if(current.consent_status!=="opted_in")return json({error:"customer_contact_consent_required",consentStatus:current.consent_status},409);
      if(current.status==="approved")return json({ok:true,replayed:true,followup:followupDto(current),execution:{performed:false,dispatchEnabled:false,reason:"customer_dispatch_not_enabled"}});
      if(current.status!=="draft")return json({error:"customer_followup_not_approvable",status:current.status},409);
      const updated=await env.DB.prepare("UPDATE customer_followups SET status='approved',approved_by_user_id=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='draft'")
        .bind(auth.user_id,actionRoute.followupId,auth.tenant_id).run();
      if(Number(updated?.meta?.changes??updated?.changes??0)!==1)return json({error:"customer_followup_state_conflict"},409);
      await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CUSTOMER_FOLLOWUP_APPROVED",entityType:"customer_followup",entityId:actionRoute.followupId,payload:{customerId:current.customer_id,contactId:current.contact_id,invoiceId:current.invoice_id||null,purpose:current.purpose,status:"approved",externalDispatch:false},sha256Hex,id});
      await writeAudit(env,auth.tenant_id,auth.user_id,"CUSTOMER_FOLLOWUP_APPROVED",{followupId:actionRoute.followupId,customerId:current.customer_id,externalDispatch:false});
      const row=await followupDetail(env,auth.tenant_id,actionRoute.followupId);
      return json({ok:true,followup:followupDto(row),execution:{performed:false,externalSideEffect:false,dispatchEnabled:false,reason:"customer_dispatch_not_enabled"}});
    }
    if(current.status==="cancelled")return json({ok:true,replayed:true,followup:followupDto(current)});
    if(!["draft","approved"].includes(current.status))return json({error:"customer_followup_not_cancellable",status:current.status},409);
    const updated=await env.DB.prepare("UPDATE customer_followups SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status IN ('draft','approved')")
      .bind(actionRoute.followupId,auth.tenant_id).run();
    if(Number(updated?.meta?.changes??updated?.changes??0)!==1)return json({error:"customer_followup_state_conflict"},409);
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CUSTOMER_FOLLOWUP_CANCELLED",entityType:"customer_followup",entityId:actionRoute.followupId,payload:{customerId:current.customer_id,previousStatus:current.status,status:"cancelled"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"CUSTOMER_FOLLOWUP_CANCELLED",{followupId:actionRoute.followupId,customerId:current.customer_id,previousStatus:current.status});
    const row=await followupDetail(env,auth.tenant_id,actionRoute.followupId);
    return json({ok:true,followup:followupDto(row)});
  }

  return null;
}

export const __customerRelationshipsTest=Object.freeze({
  customerContactsPath,customerFollowupsPath,followupActionPath,normalizeEmail,normalizeBotswanaWhatsApp,maskContact,
  CONTACT_CHANNELS,CONSENT_STATUSES,FOLLOWUP_PURPOSES,FOLLOWUP_STATUSES,MAX_LIST
});
