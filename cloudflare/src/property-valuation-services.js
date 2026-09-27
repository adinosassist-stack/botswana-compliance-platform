import {DEFAULT_RUNTIME_MARKET_CODE,marketBusinessDate} from "./market-profile.js";

export const PROPERTY_VALUATION_SERVICES_VERSION="2026-09-27.v176";
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
const requestRoute=pathname=>{const m=String(pathname||"").match(/^\/api\/property\/valuation-services\/([^/]+)$/);return m?{requestId:text(m[1],64)}:null};
const internalRoute=pathname=>{const m=String(pathname||"").match(/^\/api\/internal\/property\/valuation-services\/([^/]+)\/([^/]+)$/);return m?{requestId:text(m[1],64),action:text(m[2],32)}:null};

async function event(env,row,eventType,actorUserId,data={}){
  await env.DB.prepare("INSERT INTO property_valuation_service_events(request_id,tenant_id,event_type,actor_user_id,event_data) VALUES(?,?,?,?,?)")
    .bind(row.id,row.tenant_id,eventType,actorUserId||null,JSON.stringify(data)).run();
}
async function syncPaymentStatus(env,row){
  if(!row?.service_order_id)return row;
  const order=await env.DB.prepare("SELECT status FROM service_orders WHERE id=? LIMIT 1").bind(row.service_order_id).first();
  const paymentStatus=String(order?.status||"");
  if(paymentStatus==="paid"&&row.status==="awaiting_payment"){
    await env.DB.prepare("UPDATE property_valuation_service_requests SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='awaiting_payment'").bind(row.id).run();
    await event(env,row,"PAYMENT_CONFIRMED",null,{serviceOrderId:row.service_order_id});
    return {...row,status:"paid",service_order_status:"paid"};
  }
  if(paymentStatus==="refunded"&&!["report_issued","refunded"].includes(row.status)){
    await env.DB.prepare("UPDATE property_valuation_service_requests SET status='refunded',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
    await event(env,row,"PAYMENT_REFUNDED",null,{serviceOrderId:row.service_order_id});
    return {...row,status:"refunded",service_order_status:"refunded"};
  }
  return {...row,service_order_status:paymentStatus||null};
}
async function readRequest(env,tenantId,requestId){
  return env.DB.prepare(
    "SELECT r.*,a.name property_name,a.location_text property_location,a.property_type,o.status service_order_status,"+
    "p.display_name professional_name,p.professional_type,p.verification_status professional_verification_status "+
    "FROM property_valuation_service_requests r JOIN property_assets a ON a.id=r.property_id AND a.tenant_id=r.tenant_id "+
    "LEFT JOIN service_orders o ON o.id=r.service_order_id LEFT JOIN professional_profiles p ON p.user_id=r.assigned_professional_user_id "+
    "WHERE r.tenant_id=? AND r.id=? LIMIT 1"
  ).bind(tenantId,requestId).first();
}
function publicItem(row){
  return {
    id:String(row.id||""),propertyId:String(row.property_id||""),propertyName:text(row.property_name,160),
    propertyLocation:text(row.property_location,240),propertyType:text(row.property_type,32),purpose:text(row.purpose,40),
    status:text(row.status,40),desiredByDate:row.desired_by_date||null,accessContactName:text(row.access_contact_name,160),
    accessContactPhone:text(row.access_contact_phone,40),clientNotes:text(row.client_notes,1200),
    quotedFeeBwp:row.quoted_fee_bwp==null?null:Number(row.quoted_fee_bwp),quoteExpiresAt:row.quote_expires_at||null,
    serviceOrderId:row.service_order_id||null,serviceOrderStatus:row.service_order_status||null,
    assignedProfessional:row.assigned_professional_user_id?{displayName:text(row.professional_name,160),professionalType:text(row.professional_type,80),verificationStatus:text(row.professional_verification_status,32)}:null,
    inspectionScheduledAt:row.inspection_scheduled_at||null,issuedValuationId:row.issued_valuation_id||null,
    issuedReportEvidenceId:row.issued_report_evidence_id||null,createdAt:row.created_at||null,updatedAt:row.updated_at||null,completedAt:row.completed_at||null,
    authority:{thebeIsWorkflowPlatform:true,thebeCreatesValuation:false,thebeSignsValuation:false,humanProfessionalSignoffRequired:true,verifiedValuerAssignmentRequired:true}
  };
}

export async function handlePropertyValuationServicesRequest({request,url,env,auth,json,readJson,id,writeAudit,roleAllowed,privilegedSecretGate}={}){
  const path=String(url?.pathname||"");
  if(!path.includes("/property/valuation-services"))return null;

  if(path==="/api/property/valuation-services"&&request.method==="GET"){
    if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
    const rows=await env.DB.prepare(
      "SELECT r.*,a.name property_name,a.location_text property_location,a.property_type,o.status service_order_status,"+
      "p.display_name professional_name,p.professional_type,p.verification_status professional_verification_status "+
      "FROM property_valuation_service_requests r JOIN property_assets a ON a.id=r.property_id AND a.tenant_id=r.tenant_id "+
      "LEFT JOIN service_orders o ON o.id=r.service_order_id LEFT JOIN professional_profiles p ON p.user_id=r.assigned_professional_user_id "+
      "WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 200"
    ).bind(auth.tenant_id).all();
    const items=[];for(const raw of rows.results||[])items.push(publicItem(await syncPaymentStatus(env,raw)));
    return json({available:true,version:PROPERTY_VALUATION_SERVICES_VERSION,items,commercialModel:"quote_then_verified_payment",
      authority:{thebeCreatesValuation:false,thebeSignsValuation:false,humanProfessionalSignoffRequired:true}});
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
    await event(env,row,"CUSTOMER_CANCELED",auth.user_id,{from:row.status});
    await writeAudit(env,auth.tenant_id,auth.user_id,"PROPERTY_VALUATION_SERVICE_CANCELED",{requestId:row.id,fromStatus:row.status});
    return json({ok:true,status:"canceled"});
  }

  const internal=internalRoute(path);
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
      if(!quoteExpiresAt||Number.isNaN(Date.parse(quoteExpiresAt)))return json({error:"invalid_quote_expiry"},400);
      const serviceOrderId=row.service_order_id||id(),orderNote="Professional property valuation request "+row.id;
      if(row.service_order_id){
        const order=await env.DB.prepare("SELECT status FROM service_orders WHERE id=? LIMIT 1").bind(serviceOrderId).first();
        if(order&&!["draft","awaiting_payment"].includes(order.status))return json({error:"valuation_quote_locked_after_payment",serviceOrderStatus:order.status},409);
        await env.DB.prepare("UPDATE service_orders SET price_bwp=?,notes=?,status='awaiting_payment',updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(fee,orderNote,serviceOrderId).run();
      }else{
        await env.DB.prepare("INSERT INTO service_orders(id,tenant_id,sku,source_type,source_id,status,price_bwp,notes) VALUES(?,?, 'PROPERTY_VALUATION', 'property_valuation_service',?,'awaiting_payment',?,?)")
          .bind(serviceOrderId,row.tenant_id,row.id,fee,orderNote).run();
      }
      await env.DB.prepare("UPDATE property_valuation_service_requests SET status='awaiting_payment',quoted_fee_bwp=?,quote_expires_at=?,service_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(fee,quoteExpiresAt,serviceOrderId,row.id).run();
      await event(env,row,"QUOTE_ISSUED",auth.user_id,{feeBwp:fee,quoteExpiresAt,serviceOrderId});
      return json({ok:true,status:"awaiting_payment",feeBwp:fee,quoteExpiresAt,serviceOrderId});
    }

    if(internal.action==="assign"){
      const synced=await syncPaymentStatus(env,row);if(!["paid","assigned"].includes(synced.status))return json({error:"valuation_service_payment_required",status:synced.status},409);
      const professionalUserId=text(body.professionalUserId,64);if(!professionalUserId)return json({error:"professional_user_required"},400);
      try{
        await env.DB.prepare("UPDATE property_valuation_service_requests SET status='assigned',assigned_professional_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(professionalUserId,row.id).run();
      }catch(error){
        if(String(error).includes("property_valuation_service_professional_not_verified"))return json({error:"verified_property_valuer_required"},409);
        throw error;
      }
      await env.DB.prepare("UPDATE service_orders SET status='assigned',professional_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='paid'")
        .bind(professionalUserId,row.service_order_id).run();
      await event(env,row,"PROFESSIONAL_ASSIGNED",auth.user_id,{professionalUserId});
      return json({ok:true,status:"assigned",professionalUserId});
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
      try{
        await env.DB.prepare("UPDATE property_valuation_service_requests SET status='report_issued',issued_valuation_id=?,issued_report_evidence_id=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='professional_review'")
          .bind(valuationId,reportEvidenceId,row.id).run();
      }catch(error){
        if(String(error).includes("property_valuation_service_issuance_incomplete")||String(error).includes("property_valuation_service_report_not_linked"))return json({error:"governed_signed_report_required"},409);
        throw error;
      }
      if(row.service_order_id)await env.DB.prepare("UPDATE service_orders SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.service_order_id).run();
      await event(env,row,"REPORT_ISSUED",auth.user_id,{valuationId,reportEvidenceId});return json({ok:true,status:"report_issued",valuationId,reportEvidenceId});
    }
    return json({error:"unknown_valuation_service_action"},404);
  }
  return null;
}
export const __propertyValuationServicesTest=Object.freeze({PURPOSES,CUSTOMER_CANCELABLE,OPS_TRANSITIONS});
