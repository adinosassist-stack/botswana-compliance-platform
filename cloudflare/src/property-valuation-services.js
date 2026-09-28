import {DEFAULT_RUNTIME_MARKET_CODE,marketBusinessDate} from "./market-profile.js";

export const PROPERTY_VALUATION_SERVICES_VERSION="2026-09-28.v179";
const PURPOSES=new Set(["finance","sale","purchase","insurance","financial_reporting","estate","legal","tax","internal","other"]);
const CUSTOMER_CANCELABLE=new Set(["requested","quoted","awaiting_payment"]);
const OPS_TRANSITIONS=Object.freeze({
  paid:new Set(["assigned","refunded"]),assigned:new Set(["inspection_scheduled","fieldwork_complete","canceled"]),
  inspection_scheduled:new Set(["fieldwork_complete","canceled"]),fieldwork_complete:new Set(["drafting","canceled"]),
  drafting:new Set(["professional_review","canceled"]),professional_review:new Set(["report_issued","drafting"]),
  report_issued:new Set([]),refunded:new Set([]),canceled:new Set([]),declined:new Set([])
});
const text=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))&&!Number.isNaN(Date.parse(String(value)+"T00:00:00Z"));
const phone=value=>text(value,40).replace(/[^+0-9 ()-]/g,"");
const safeJson=value=>{try{return JSON.parse(String(value||"{}"))}catch{return {}}};
function professionalCredentialReady(row,now=Date.now()){
  if(!row||String(row.verification_status||"")!=="verified")return false;
  if(!["property_valuer","valuer","registered_valuer"].includes(String(row.professional_type||"").toLowerCase()))return false;
  if(text(row.registration_ref,120).length<2||text(row.registration_authority,160).length<2||text(row.registration_jurisdiction,80).length<2)return false;
  if(!row.credential_verified_at)return false;
  if(row.registration_valid_until){
    const expiry=Date.parse(String(row.registration_valid_until)+"T23:59:59Z");
    if(!Number.isFinite(expiry)||expiry<Number(now))return false;
  }
  return true;
}
const requestRoute=pathname=>{const m=String(pathname||"").match(/^\/api\/property\/valuation-services\/([^/]+)$/);return m?{requestId:text(m[1],64)}:null};
const internalRoute=pathname=>{const m=String(pathname||"").match(/^\/api\/internal\/property\/valuation-services\/([^/]+)\/([^/]+)$/);return m?{requestId:text(m[1],64),action:text(m[2],32)}:null};
const professionalCredentialRoute=pathname=>{const m=String(pathname||"").match(/^\/api\/internal\/property\/valuation-services\/professionals\/([^/]+)\/credential$/);return m?{professionalUserId:text(m[1],64)}:null};
const professionalsRoute=pathname=>String(pathname||"")==="/api/internal/property/valuation-services/professionals";

async function event(env,row,eventType,actorUserId,data={}){
  await env.DB.prepare("INSERT INTO property_valuation_service_events(request_id,tenant_id,event_type,actor_user_id,event_data) VALUES(?,?,?,?,?)")
    .bind(row.id,row.tenant_id,eventType,actorUserId||null,JSON.stringify(data)).run();
}
async function syncPaymentStatus(env,row){
  if(!row?.service_order_id)return row;
  const order=await env.DB.prepare("SELECT status FROM service_orders WHERE id=? LIMIT 1").bind(row.service_order_id).first();
  const paymentStatus=String(order?.status||"");
  if(paymentStatus==="paid"&&row.status==="awaiting_payment"){
    const changed=await env.DB.prepare("UPDATE property_valuation_service_requests SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='awaiting_payment'").bind(row.id).run();
    if(Number(changed.meta?.changes||0)===1){
      await event(env,row,"PAYMENT_CONFIRMED",null,{serviceOrderId:row.service_order_id});
      return {...row,status:"paid",service_order_status:"paid"};
    }
    const current=await env.DB.prepare("SELECT status FROM property_valuation_service_requests WHERE id=? LIMIT 1").bind(row.id).first();
    return {...row,status:String(current?.status||row.status),service_order_status:"paid"};
  }
  if(paymentStatus==="refunded"&&!["report_issued","refunded"].includes(row.status)){
    const changed=await env.DB.prepare("UPDATE property_valuation_service_requests SET status='refunded',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='refunded' AND status!='report_issued'").bind(row.id).run();
    if(Number(changed.meta?.changes||0)===1){
      await event(env,row,"PAYMENT_REFUNDED",null,{serviceOrderId:row.service_order_id});
      return {...row,status:"refunded",service_order_status:"refunded"};
    }
    const current=await env.DB.prepare("SELECT status FROM property_valuation_service_requests WHERE id=? LIMIT 1").bind(row.id).first();
    return {...row,status:String(current?.status||row.status),service_order_status:"refunded"};
  }
  return {...row,service_order_status:paymentStatus||null};
}
async function readRequest(env,tenantId,requestId){
  return env.DB.prepare(
    "SELECT r.*,a.name property_name,a.location_text property_location,a.property_type,o.status service_order_status,"+
    "p.display_name professional_name,p.professional_type,p.verification_status professional_verification_status,"+
    "p.registration_ref professional_registration_ref,p.registration_authority professional_registration_authority,"+
    "p.registration_jurisdiction professional_registration_jurisdiction,p.registration_valid_until professional_registration_valid_until,"+
    "p.credential_verified_at professional_credential_verified_at "+
    "FROM property_valuation_service_requests r JOIN property_assets a ON a.id=r.property_id AND a.tenant_id=r.tenant_id "+
    "LEFT JOIN service_orders o ON o.id=r.service_order_id LEFT JOIN professional_profiles p ON p.user_id=r.assigned_professional_user_id "+
    "WHERE r.tenant_id=? AND r.id=? LIMIT 1"
  ).bind(tenantId,requestId).first();
}
function quoteExpired(row,now=Date.now()){
  const expiry=Date.parse(String(row?.quote_expires_at||""));
  return Number.isFinite(expiry)&&expiry<=Number(now);
}
function serviceSummary(items=[]){
  const rows=Array.isArray(items)?items:[];
  const terminal=new Set(["report_issued","declined","canceled","refunded"]);
  let active=0,awaitingPayment=0,inProgress=0,completed=0,quotedPipelineBwp=0,completedRevenueBwp=0,expiredQuotes=0;
  for(const item of rows){
    if(!terminal.has(item.status))active++;
    if(item.status==="awaiting_payment"){awaitingPayment++;quotedPipelineBwp+=Number(item.quotedFeeBwp||0);if(item.quoteExpired)expiredQuotes++}
    if(["paid","assigned","inspection_scheduled","fieldwork_complete","drafting","professional_review"].includes(item.status))inProgress++;
    if(item.status==="report_issued"){completed++;completedRevenueBwp+=Number(item.quotedFeeBwp||0)}
  }
  return {activeRequests:active,awaitingPayment,inProgress,completed,quotedPipelineBwp,completedRevenueBwp,expiredQuotes};
}
function publicItem(row){
  const expired=quoteExpired(row);
  return {
    id:String(row.id||""),propertyId:String(row.property_id||""),propertyName:text(row.property_name,160),
    propertyLocation:text(row.property_location,240),propertyType:text(row.property_type,32),purpose:text(row.purpose,40),
    status:text(row.status,40),desiredByDate:row.desired_by_date||null,accessContactName:text(row.access_contact_name,160),
    accessContactPhone:text(row.access_contact_phone,40),clientNotes:text(row.client_notes,1200),
    quotedFeeBwp:row.quoted_fee_bwp==null?null:Number(row.quoted_fee_bwp),quoteIssuedAt:row.quote_issued_at||null,quoteExpiresAt:row.quote_expires_at||null,
    quoteExpired:expired,payable:row.status==="awaiting_payment"&&!expired&&row.service_order_status==="awaiting_payment",
    serviceOrderId:row.service_order_id||null,serviceOrderStatus:row.service_order_status||null,
    assignedProfessional:row.assigned_professional_user_id?{
      displayName:text(row.professional_name,160),professionalType:text(row.professional_type,80),
      verificationStatus:text(row.professional_verification_status,32),
      registrationRef:text(row.professional_registration_ref||row.assigned_professional_registration_ref,120),
      registrationAuthority:text(row.professional_registration_authority,160),
      registrationJurisdiction:text(row.professional_registration_jurisdiction,80),
      registrationValidUntil:row.professional_registration_valid_until||null,
      credentialVerifiedAt:row.professional_credential_verified_at||null,
      credentialReady:professionalCredentialReady({
        verification_status:row.professional_verification_status,professional_type:row.professional_type,
        registration_ref:row.professional_registration_ref,registration_authority:row.professional_registration_authority,
        registration_jurisdiction:row.professional_registration_jurisdiction,registration_valid_until:row.professional_registration_valid_until,
        credential_verified_at:row.professional_credential_verified_at
      }),
      credentialBindingSource:"verified_professional_profile"
    }:null,
    inspectionScheduledAt:row.inspection_scheduled_at||null,issuedValuationId:row.issued_valuation_id||null,
    issuedReportEvidenceId:row.issued_report_evidence_id||null,createdAt:row.created_at||null,updatedAt:row.updated_at||null,completedAt:row.completed_at||null,
    authority:{thebeIsWorkflowPlatform:true,thebeCreatesValuation:false,thebeSignsValuation:false,humanProfessionalSignoffRequired:true,verifiedValuerAssignmentRequired:true,professionalCredentialRecordedNotCertifiedByThebe:true}
  };
}

export async function handlePropertyValuationServicesRequest({request,url,env,auth,json,readJson,id,writeAudit,roleAllowed,privilegedSecretGate}={}){
  const path=String(url?.pathname||"");
  if(!path.includes("/property/valuation-services"))return null;

  if(path==="/api/property/valuation-services"&&request.method==="GET"){
    if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
    const rows=await env.DB.prepare(
      "SELECT r.*,a.name property_name,a.location_text property_location,a.property_type,o.status service_order_status,"+
      "p.display_name professional_name,p.professional_type,p.verification_status professional_verification_status,"+
      "p.registration_ref professional_registration_ref,p.registration_authority professional_registration_authority,"+
      "p.registration_jurisdiction professional_registration_jurisdiction,p.registration_valid_until professional_registration_valid_until,"+
      "p.credential_verified_at professional_credential_verified_at "+
      "FROM property_valuation_service_requests r JOIN property_assets a ON a.id=r.property_id AND a.tenant_id=r.tenant_id "+
      "LEFT JOIN service_orders o ON o.id=r.service_order_id LEFT JOIN professional_profiles p ON p.user_id=r.assigned_professional_user_id "+
      "WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 200"
    ).bind(auth.tenant_id).all();
    const items=[];for(const raw of rows.results||[])items.push(publicItem(await syncPaymentStatus(env,raw)));
    return json({available:true,version:PROPERTY_VALUATION_SERVICES_VERSION,items,summary:serviceSummary(items),commercialModel:"quote_then_verified_payment",
      authority:{thebeCreatesValuation:false,thebeSignsValuation:false,humanProfessionalSignoffRequired:true,credentialBoundIssuance:true}});
  }

  if(professionalsRoute(path)&&request.method==="GET"){
    const supplied=request.headers.get("x-operations-secret")||"";
    const gate=await privilegedSecretGate(env,request,"operations-secret",supplied,env.OPERATIONS_SECRET,auth?.user_id||"");if(!gate.ok)return gate.response;
    const rows=await env.DB.prepare(
      "SELECT p.user_id,u.email,p.display_name,p.professional_type,p.verification_status,p.registration_ref,p.registration_authority,p.registration_jurisdiction,p.registration_valid_until,p.credential_verified_at,p.credential_verified_by_user_id,p.updated_at "+
      "FROM professional_profiles p JOIN users u ON u.id=p.user_id "+
      "WHERE lower(p.professional_type) IN ('property_valuer','valuer','registered_valuer') ORDER BY p.verification_status,p.display_name LIMIT 200"
    ).all();
    const items=(rows.results||[]).map(row=>({
      userId:String(row.user_id||""),email:text(row.email,240),displayName:text(row.display_name,160),professionalType:text(row.professional_type,80),
      verificationStatus:text(row.verification_status,32),registrationRef:text(row.registration_ref,120),
      registrationAuthority:text(row.registration_authority,160),registrationJurisdiction:text(row.registration_jurisdiction,80),
      registrationValidUntil:row.registration_valid_until||null,credentialVerifiedAt:row.credential_verified_at||null,
      credentialReady:professionalCredentialReady(row),updatedAt:row.updated_at||null
    }));
    return json({items,authority:{thebeRecordsCredentialMetadata:true,thebeCertifiesProfessionalCredentials:false,assignmentRequiresReadyCredential:true}});
  }

  const credential=professionalCredentialRoute(path);
  if(credential&&request.method==="POST"){
    const supplied=request.headers.get("x-operations-secret")||"";
    const gate=await privilegedSecretGate(env,request,"operations-secret",supplied,env.OPERATIONS_SECRET,auth?.user_id||"");if(!gate.ok)return gate.response;
    const body=await readJson(request,{maxBytes:16*1024});
    const user=await env.DB.prepare("SELECT id,email,display_name FROM users WHERE id=? LIMIT 1").bind(credential.professionalUserId).first();
    if(!user)return json({error:"professional_user_not_found"},404);
    const professionalType=text(body.professionalType||"registered_valuer",80).toLowerCase();
    if(!["property_valuer","valuer","registered_valuer"].includes(professionalType))return json({error:"invalid_property_valuer_type"},400);
    const verificationStatus=text(body.verificationStatus||"verified",32).toLowerCase();
    if(!["pending","verified","suspended"].includes(verificationStatus))return json({error:"invalid_professional_verification_status"},400);
    const displayName=text(body.displayName||user.display_name||user.email,160);
    const registrationRef=text(body.registrationRef,120),registrationAuthority=text(body.registrationAuthority,160),
      registrationJurisdiction=text(body.registrationJurisdiction,80),registrationValidUntil=text(body.registrationValidUntil,10)||null,
      note=text(body.verificationNote,500);
    if(registrationValidUntil&&!validDate(registrationValidUntil))return json({error:"invalid_registration_valid_until"},400);
    if(verificationStatus==="verified"&&(registrationRef.length<2||registrationAuthority.length<2||registrationJurisdiction.length<2))
      return json({error:"professional_valuer_credential_required"},400);
    const prior=await env.DB.prepare("SELECT verification_status,registration_ref FROM professional_profiles WHERE user_id=? LIMIT 1").bind(user.id).first();
    const verifiedAt=verificationStatus==="verified"?new Date().toISOString():null;
    const eventType=verificationStatus==="suspended"?"CREDENTIAL_SUSPENDED":verificationStatus==="verified"?"CREDENTIAL_VERIFIED":prior?"CREDENTIAL_UPDATED":"CREDENTIAL_RECORDED";
    try{
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO professional_profiles(user_id,professional_type,display_name,verification_status,service_categories_json,registration_ref,registration_authority,registration_jurisdiction,registration_valid_until,credential_verified_at,credential_verified_by_user_id,credential_verification_note,updated_at) "+
          "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) "+
          "ON CONFLICT(user_id) DO UPDATE SET professional_type=excluded.professional_type,display_name=excluded.display_name,verification_status=excluded.verification_status,"+
          "registration_ref=excluded.registration_ref,registration_authority=excluded.registration_authority,registration_jurisdiction=excluded.registration_jurisdiction,"+
          "registration_valid_until=excluded.registration_valid_until,credential_verified_at=excluded.credential_verified_at,credential_verified_by_user_id=excluded.credential_verified_by_user_id,"+
          "credential_verification_note=excluded.credential_verification_note,updated_at=CURRENT_TIMESTAMP"
        ).bind(user.id,professionalType,displayName,verificationStatus,JSON.stringify(["property_valuation"]),registrationRef||null,registrationAuthority||null,registrationJurisdiction||null,registrationValidUntil,verifiedAt,verificationStatus==="verified"?auth.user_id:null,note||null),
        env.DB.prepare(
          "INSERT INTO professional_credential_events(professional_user_id,actor_user_id,event_type,registration_ref,registration_authority,registration_jurisdiction,registration_valid_until,event_data) VALUES(?,?,?,?,?,?,?,?)"
        ).bind(user.id,auth.user_id,eventType,registrationRef||null,registrationAuthority||null,registrationJurisdiction||null,registrationValidUntil,JSON.stringify({verificationStatus,previousVerificationStatus:prior?.verification_status||null,previousRegistrationRef:prior?.registration_ref||null,note:note||null}))
      ]);
    }catch(error){
      const message=String(error);
      if(message.includes("professional_valuer_credential_required"))return json({error:"professional_valuer_credential_required"},409);
      if(message.includes("professional_valuer_credential_expired"))return json({error:"professional_valuer_credential_expired"},409);
      if(message.includes("professional_valuer_credential_verification_required"))return json({error:"professional_valuer_credential_verification_required"},409);
      if(/UNIQUE/i.test(message))return json({error:"professional_registration_already_bound"},409);
      return json({error:"professional_credential_write_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_VALUER_CREDENTIAL_RECORDED",{
      professionalUserId:user.id,verificationStatus,registrationRef:registrationRef||null,
      registrationAuthority:registrationAuthority||null,registrationJurisdiction:registrationJurisdiction||null,registrationValidUntil
    });
    return json({ok:true,userId:user.id,verificationStatus,registrationRef:registrationRef||null,registrationAuthority:registrationAuthority||null,
      registrationJurisdiction:registrationJurisdiction||null,registrationValidUntil,credentialReady:verificationStatus==="verified",
      authority:{thebeRecordsCredentialMetadata:true,thebeCertifiesProfessionalCredentials:false}},verificationStatus==="verified"?200:202);
  }

  if(path==="/api/property/valuation-services"&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:16*1024});
    const propertyId=text(body.propertyId,64),purpose=text(body.purpose,40).toLowerCase(),desiredByDate=text(body.desiredByDate,10)||null,
      accessContactName=text(body.accessContactName,160),accessContactPhone=phone(body.accessContactPhone),clientNotes=text(body.clientNotes,1200);
    if(!propertyId)return json({error:"property_required"},400);
    if(!PURPOSES.has(purpose))return json({error:"invalid_valuation_purpose"},400);
    if(desiredByDate&&!validDate(desiredByDate))return json({error:"invalid_desired_by_date"},400);
    const businessDate=marketBusinessDate(new Date(),DEFAULT_RUNTIME_MARKET_CODE);
    if(desiredByDate&&desiredByDate<businessDate)return json({error:"desired_by_date_in_past"},400);
    const asset=await env.DB.prepare("SELECT id,status FROM property_assets WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,propertyId).first();
    if(!asset||asset.status!=="active")return json({error:"active_property_required"},409);
    const duplicate=await env.DB.prepare(
      "SELECT id,status FROM property_valuation_service_requests WHERE tenant_id=? AND property_id=? AND purpose=? AND status NOT IN ('report_issued','declined','canceled','refunded') ORDER BY created_at DESC LIMIT 1"
    ).bind(auth.tenant_id,propertyId,purpose).first();
    if(duplicate)return json({error:"valuation_service_active_request_exists",requestId:duplicate.id,status:duplicate.status},409);
    const requestId=id();
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO property_valuation_service_requests(id,tenant_id,property_id,requested_by_user_id,purpose,desired_by_date,access_contact_name,access_contact_phone,client_notes) VALUES(?,?,?,?,?,?,?,?,?)")
          .bind(requestId,auth.tenant_id,propertyId,auth.user_id,purpose,desiredByDate,accessContactName||null,accessContactPhone||null,clientNotes||null),
        env.DB.prepare("INSERT INTO property_valuation_service_events(request_id,tenant_id,event_type,actor_user_id,event_data) VALUES(?,?, 'REQUEST_CREATED',?,?)")
          .bind(requestId,auth.tenant_id,auth.user_id,JSON.stringify({purpose,desiredByDate}))
      ]);
    }catch(error){
      if(String(error).includes("property_valuation_service_asset_mismatch"))return json({error:"active_property_required"},409);
      if(String(error).includes("property_valuation_service_duplicate_active"))return json({error:"valuation_service_active_request_exists"},409);
      return json({error:"valuation_service_request_failed"},503);
    }
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_VALUATION_SERVICE_REQUESTED",{requestId,propertyId,purpose});
    return json({ok:true,id:requestId,status:"requested",pricing:"quote_required"},201);
  }

  const customer=requestRoute(path);
  if(customer&&request.method==="GET"){
    if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
    let row=await readRequest(env,auth.tenant_id,customer.requestId);if(!row)return json({error:"valuation_service_request_not_found"},404);
    row=await syncPaymentStatus(env,row);
    const events=await env.DB.prepare("SELECT event_type,event_data,occurred_at FROM property_valuation_service_events WHERE request_id=? AND tenant_id=? ORDER BY occurred_at ASC,id ASC LIMIT 200")
      .bind(customer.requestId,auth.tenant_id).all();
    return json({item:publicItem(row),events:(events.results||[]).map(x=>({type:x.event_type,data:safeJson(x.event_data),at:x.occurred_at}))});
  }
  if(customer&&request.method==="DELETE"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const row=await env.DB.prepare("SELECT * FROM property_valuation_service_requests WHERE tenant_id=? AND id=? LIMIT 1").bind(auth.tenant_id,customer.requestId).first();
    if(!row)return json({error:"valuation_service_request_not_found"},404);
    if(!CUSTOMER_CANCELABLE.has(row.status))return json({error:"valuation_service_cannot_cancel",status:row.status},409);
    const changed=await env.DB.prepare("UPDATE property_valuation_service_requests SET status='canceled',canceled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status=?")
      .bind(row.id,auth.tenant_id,row.status).run();
    if(Number(changed.meta?.changes||0)!==1)return json({error:"valuation_service_state_changed"},409);
    if(row.service_order_id){
      await env.DB.batch([
        env.DB.prepare("UPDATE service_orders SET status='canceled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status IN ('draft','awaiting_payment')").bind(row.service_order_id,auth.tenant_id),
        env.DB.prepare("UPDATE payment_orders SET status='canceled',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND order_type='service' AND reference_id=? AND status IN ('pending','processing','failed')").bind(auth.tenant_id,row.service_order_id)
      ]);
    }
    await event(env,row,"CUSTOMER_CANCELED",auth.user_id,{from:row.status,serviceOrderId:row.service_order_id||null});
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_VALUATION_SERVICE_CANCELED",{requestId:row.id,fromStatus:row.status,serviceOrderId:row.service_order_id||null});
    return json({ok:true,status:"canceled"});
  }

  const internal=internalRoute(path);
  if(internal&&request.method==="GET"&&internal.action==="issuable-reports"){
    const supplied=request.headers.get("x-operations-secret")||"";
    const gate=await privilegedSecretGate(env,request,"operations-secret",supplied,env.OPERATIONS_SECRET,auth?.user_id||"");if(!gate.ok)return gate.response;
    const base=await env.DB.prepare("SELECT tenant_id FROM property_valuation_service_requests WHERE id=? LIMIT 1").bind(internal.requestId).first();
    if(!base)return json({error:"valuation_service_request_not_found"},404);
    const row=await readRequest(env,base.tenant_id,internal.requestId);
    if(!row)return json({error:"valuation_service_request_not_found"},404);
    if(String(row.status||"")!=="professional_review")return json({items:[],status:String(row.status||""),ready:false,reason:"professional_review_required"});
    const credentialReady=professionalCredentialReady({
      verification_status:row.professional_verification_status,
      professional_type:row.professional_type,
      registration_ref:row.professional_registration_ref,
      registration_authority:row.professional_registration_authority,
      registration_jurisdiction:row.professional_registration_jurisdiction,
      registration_valid_until:row.professional_registration_valid_until,
      credential_verified_at:row.professional_credential_verified_at
    });
    const assignedRegistration=text(row.assigned_professional_registration_ref,120).toLowerCase();
    const liveRegistration=text(row.professional_registration_ref,120).toLowerCase();
    if(!row.assigned_professional_user_id||!credentialReady||!assignedRegistration||assignedRegistration!==liveRegistration){
      return json({items:[],status:"professional_review",ready:false,reason:"assigned_valuer_credential_mismatch"},409);
    }
    const rows=await env.DB.prepare(
      "SELECT v.id valuation_id,v.valuation_date,v.market_value_minor,v.currency,v.valuer_name,v.valuer_registration_ref,v.report_reference,"+
      "e.id report_evidence_id,e.display_name evidence_display_name,e.review_status,e.scan_status,e.scanned_at "+
      "FROM property_professional_valuations v "+
      "JOIN property_valuation_evidence_links l ON l.tenant_id=v.tenant_id AND l.property_id=v.property_id AND l.valuation_id=v.id AND l.link_kind='signed_report' "+
      "JOIN evidence e ON e.tenant_id=v.tenant_id AND e.id=l.evidence_id "+
      "WHERE v.tenant_id=? AND v.property_id=? "+
      "AND lower(trim(v.valuer_registration_ref))=lower(trim(?)) "+
      "AND e.review_status='approved' AND e.scan_status='clean' AND e.scanned_at IS NOT NULL AND e.malware_name IS NULL AND e.deleted_at IS NULL "+
      "ORDER BY v.valuation_date DESC,v.created_at DESC LIMIT 50"
    ).bind(row.tenant_id,row.property_id,row.assigned_professional_registration_ref).all();
    const items=(rows.results||[]).map(item=>({
      valuationId:String(item.valuation_id||""),
      reportEvidenceId:String(item.report_evidence_id||""),
      valuationDate:item.valuation_date||null,
      marketValueMinor:Number(item.market_value_minor||0),
      currency:text(item.currency,3),
      valuerName:text(item.valuer_name,160),
      valuerRegistrationRef:text(item.valuer_registration_ref,120),
      reportReference:text(item.report_reference,160),
      evidenceDisplayName:text(item.evidence_display_name,240),
      evidenceReviewStatus:text(item.review_status,32),
      evidenceScanStatus:text(item.scan_status,32),
      evidenceScannedAt:item.scanned_at||null
    }));
    return json({items,status:"professional_review",ready:items.length>0,assignedProfessional:{
      displayName:text(row.professional_name,160),
      registrationRef:text(row.professional_registration_ref,120),
      credentialReady:true
    },authority:{
      existingProfessionalValuationRequired:true,
      linkedApprovedScanCleanSignedEvidenceRequired:true,
      assignedValuerRegistrationMatchRequired:true,
      thebeCreatesValuation:false,
      thebeSignsValuation:false
    }});
  }
  if(internal&&request.method==="POST"){
    const supplied=request.headers.get("x-operations-secret")||"";
    const gate=await privilegedSecretGate(env,request,"operations-secret",supplied,env.OPERATIONS_SECRET,auth?.user_id||"");if(!gate.ok)return gate.response;
    const row=await env.DB.prepare("SELECT * FROM property_valuation_service_requests WHERE id=? LIMIT 1").bind(internal.requestId).first();
    if(!row)return json({error:"valuation_service_request_not_found"},404);
    const body=await readJson(request,{maxBytes:16*1024});

    if(internal.action==="quote"){
      if(!["requested","quoted","awaiting_payment"].includes(row.status))return json({error:"valuation_service_not_quotable",status:row.status},409);
      const fee=Number(body.feeBwp),quoteExpiresAt=text(body.quoteExpiresAt,32);
      if(!Number.isSafeInteger(fee)||fee<=0||fee>1000000)return json({error:"invalid_valuation_fee"},400);
      const expiryMs=Date.parse(quoteExpiresAt);
      if(!quoteExpiresAt||Number.isNaN(expiryMs)||expiryMs<=Date.now()+15*60*1000)return json({error:"invalid_quote_expiry"},400);
      const serviceOrderId=row.service_order_id||id(),orderNote="Professional property valuation request "+row.id;
      if(row.service_order_id){
        const livePayment=await env.DB.prepare("SELECT id,status FROM payment_orders WHERE tenant_id=? AND order_type='service' AND reference_id=? AND status IN ('pending','processing') ORDER BY created_at DESC LIMIT 1")
          .bind(row.tenant_id,serviceOrderId).first();
        if(livePayment)return json({error:"valuation_quote_checkout_already_created",paymentOrderId:livePayment.id,status:livePayment.status},409);
        const order=await env.DB.prepare("SELECT status FROM service_orders WHERE id=? LIMIT 1").bind(serviceOrderId).first();
        if(order&&!["draft","awaiting_payment"].includes(order.status))return json({error:"valuation_quote_locked_after_payment",serviceOrderStatus:order.status},409);
        await env.DB.prepare("UPDATE service_orders SET price_bwp=?,notes=?,status='awaiting_payment',updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(fee,orderNote,serviceOrderId).run();
      }else{
        await env.DB.prepare("INSERT INTO service_orders(id,tenant_id,sku,source_type,source_id,status,price_bwp,notes) VALUES(?,?, 'PROPERTY_VALUATION', 'property_valuation_service',?,'awaiting_payment',?,?)")
          .bind(serviceOrderId,row.tenant_id,row.id,fee,orderNote).run();
      }
      await env.DB.prepare("UPDATE property_valuation_service_requests SET status='awaiting_payment',quoted_fee_bwp=?,quote_issued_at=CURRENT_TIMESTAMP,quote_expires_at=?,service_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(fee,quoteExpiresAt,serviceOrderId,row.id).run();
      await event(env,row,"QUOTE_ISSUED",auth.user_id,{feeBwp:fee,quoteExpiresAt,serviceOrderId});
      return json({ok:true,status:"awaiting_payment",feeBwp:fee,quoteExpiresAt,serviceOrderId});
    }

    if(internal.action==="assign"){
      const synced=await syncPaymentStatus(env,row);if(!["paid","assigned"].includes(synced.status))return json({error:"valuation_service_payment_required",status:synced.status},409);
      const professionalUserId=text(body.professionalUserId,64);
      if(!professionalUserId)return json({error:"professional_user_required"},400);
      const professional=await env.DB.prepare(
        "SELECT user_id,display_name,professional_type,verification_status,registration_ref,registration_authority,registration_jurisdiction,registration_valid_until,credential_verified_at "+
        "FROM professional_profiles WHERE user_id=? LIMIT 1"
      ).bind(professionalUserId).first();
      if(!professionalCredentialReady(professional))return json({error:"verified_property_valuer_credential_required"},409);
      const suppliedRegistrationRef=text(body.registrationRef,120);
      if(suppliedRegistrationRef&&suppliedRegistrationRef.toLowerCase()!==String(professional.registration_ref||"").trim().toLowerCase())
        return json({error:"professional_registration_mismatch"},409);
      const registrationRef=text(professional.registration_ref,120);
      try{
        await env.DB.prepare("UPDATE property_valuation_service_requests SET status='assigned',assigned_professional_user_id=?,assigned_professional_registration_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(professionalUserId,registrationRef,row.id).run();
      }catch(error){
        const message=String(error);
        if(message.includes("property_valuation_service_professional_credential_mismatch"))return json({error:"verified_property_valuer_credential_required"},409);
        if(message.includes("property_valuation_service_professional_not_verified"))return json({error:"verified_property_valuer_required"},409);
        if(message.includes("property_valuation_service_registration_required"))return json({error:"professional_registration_required"},409);
        throw error;
      }
      await env.DB.prepare("UPDATE service_orders SET status='assigned',professional_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='paid'")
        .bind(professionalUserId,row.service_order_id).run();
      await event(env,row,"PROFESSIONAL_ASSIGNED",auth.user_id,{
        professionalUserId,registrationRef,registrationAuthority:professional.registration_authority,
        registrationJurisdiction:professional.registration_jurisdiction,registrationValidUntil:professional.registration_valid_until||null,
        credentialBindingSource:"verified_professional_profile"
      });
      return json({ok:true,status:"assigned",professionalUserId,registrationRef,
        registrationAuthority:professional.registration_authority,registrationJurisdiction:professional.registration_jurisdiction,
        registrationValidUntil:professional.registration_valid_until||null,credentialBindingSource:"verified_professional_profile"});
    }

    if(internal.action==="advance"){
      const current=String(row.status||""),next=text(body.status,40);if(!OPS_TRANSITIONS[current]?.has(next))return json({error:"invalid_valuation_service_transition",from:current,to:next},409);
      const inspectionScheduledAt=next==="inspection_scheduled"?text(body.inspectionScheduledAt,40):(row.inspection_scheduled_at||null);
      if(next==="inspection_scheduled"&&(!inspectionScheduledAt||Number.isNaN(Date.parse(inspectionScheduledAt))))return json({error:"inspection_schedule_required"},400);
      const changed=await env.DB.prepare("UPDATE property_valuation_service_requests SET status=?,inspection_scheduled_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?")
        .bind(next,inspectionScheduledAt,row.id,current).run();
      if(Number(changed.meta?.changes||0)!==1)return json({error:"valuation_service_state_changed"},409);
      await event(env,row,"STATUS_CHANGED",auth.user_id,{from:current,to:next,inspectionScheduledAt});return json({ok:true,status:next});
    }

    if(internal.action==="issue"){
      if(row.status!=="professional_review")return json({error:"professional_review_required",status:row.status},409);
      const valuationId=text(body.valuationId,64),reportEvidenceId=text(body.reportEvidenceId,64);if(!valuationId||!reportEvidenceId)return json({error:"issued_valuation_and_report_required"},400);
      const governedReport=await env.DB.prepare(
        "SELECT v.id valuation_id,e.id evidence_id FROM property_professional_valuations v "+
        "JOIN property_valuation_evidence_links l ON l.tenant_id=v.tenant_id AND l.property_id=v.property_id AND l.valuation_id=v.id AND l.evidence_id=? AND l.link_kind='signed_report' "+
        "JOIN evidence e ON e.tenant_id=v.tenant_id AND e.id=l.evidence_id "+
        "WHERE v.id=? AND v.tenant_id=? AND v.property_id=? "+
        "AND lower(trim(v.valuer_registration_ref))=lower(trim(?)) "+
        "AND e.review_status='approved' AND e.scan_status='clean' AND e.scanned_at IS NOT NULL AND e.malware_name IS NULL AND e.deleted_at IS NULL LIMIT 1"
      ).bind(reportEvidenceId,valuationId,row.tenant_id,row.property_id,row.assigned_professional_registration_ref||"").first();
      if(!governedReport)return json({error:"governed_signed_report_required"},409);
      try{
        const changed=await env.DB.prepare("UPDATE property_valuation_service_requests SET status='report_issued',issued_valuation_id=?,issued_report_evidence_id=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='professional_review'")
          .bind(valuationId,reportEvidenceId,row.id).run();
        if(Number(changed.meta?.changes||0)!==1)return json({error:"valuation_service_state_changed"},409);
      }catch(error){
        if(String(error).includes("property_valuation_service_issuance_incomplete")||String(error).includes("property_valuation_service_report_not_linked"))return json({error:"governed_signed_report_required"},409);
        if(String(error).includes("property_valuation_service_registration_required")||String(error).includes("property_valuation_service_credential_mismatch")||String(error).includes("property_valuation_service_professional_credential_mismatch"))return json({error:"assigned_valuer_credential_mismatch"},409);
        throw error;
      }
      if(row.service_order_id)await env.DB.prepare("UPDATE service_orders SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(row.service_order_id,row.tenant_id).run();
      await event(env,row,"REPORT_ISSUED",auth.user_id,{valuationId,reportEvidenceId});return json({ok:true,status:"report_issued",valuationId,reportEvidenceId});
    }
    return json({error:"unknown_valuation_service_action"},404);
  }
  return null;
}
export const __propertyValuationServicesTest=Object.freeze({PURPOSES,CUSTOMER_CANCELABLE,OPS_TRANSITIONS,quoteExpired,serviceSummary,professionalCredentialReady});
