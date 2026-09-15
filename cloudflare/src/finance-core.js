const ACCOUNT_TYPES=new Set(["bank","cash","mobile_money","clearing"]);
const SOURCE_TYPES=new Set(["manual","csv","adapter"]);
const CONNECTION_STATUSES=new Set(["not_configured","active","paused","error","revoked"]);
const PROVIDER_DEFINITIONS=Object.freeze({
  fnb_bw_business:Object.freeze({key:"fnb_bw_business",label:"FNB Botswana Business",connectionType:"bank_feed",readOnly:true,credentialStorage:"external",activationMode:"provider_onboarding_required"}),
  xero:Object.freeze({key:"xero",label:"Xero",connectionType:"accounting_feed",readOnly:true,credentialStorage:"external",activationMode:"provider_onboarding_required"}),
  generic_adapter:Object.freeze({key:"generic_adapter",label:"Approved read-only adapter",connectionType:"generic_adapter",readOnly:true,credentialStorage:"external",activationMode:"owner_attested_read_only"})
});
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPORT_ROWS=1000;
const MAX_CONNECTIONS=100;
const SECRET_FIELD=/(?:^|_)(?:access_?token|refresh_?token|token|secret|password|api_?key|client_?secret|credentials?)(?:$|_)/i;
const text=(value,max=240)=>String(value??"").trim().slice(0,max);
const integer=value=>Number.isSafeInteger(Number(value))?Number(value):null;

function validDate(value){
  const v=text(value,10);
  if(!ISO_DATE.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}

function normalizeFinanceRow(row,index=0){
  const postedOn=text(row?.postedOn||row?.date,10),description=text(row?.description,500),reference=text(row?.reference,160),sourceId=text(row?.sourceId||row?.externalId||row?.transactionId,160);
  const amountMinor=integer(row?.amountMinor);
  if(!validDate(postedOn))return {ok:false,error:"invalid_posted_on",index};
  if(!description)return {ok:false,error:"description_required",index};
  if(amountMinor===null||amountMinor===0)return {ok:false,error:"invalid_amount_minor",index};
  return {ok:true,row:{postedOn,description,reference,amountMinor,sourceId}};
}

function sourceFingerprintBasis({tenantId,accountId,sourceType,provider,idempotencyKey,row,index}){
  if(row.sourceId)return [tenantId,accountId,"source",sourceType,provider||"",row.sourceId];
  return [tenantId,accountId,"batch",idempotencyKey,index,row.postedOn,row.amountMinor,row.reference,row.description];
}

function sameFingerprintSet(actual,expected){
  const normalize=values=>[...new Set((values||[]).map(value=>String(value||"")))].filter(Boolean).sort();
  const a=normalize(actual),b=normalize(expected);
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

function containsSecretMaterial(value,depth=0){
  if(depth>4||value===null||value===undefined)return false;
  if(Array.isArray(value))return value.some(item=>containsSecretMaterial(item,depth+1));
  if(typeof value!=="object")return false;
  for(const [key,item] of Object.entries(value)){
    const normalizedKey=String(key).replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`);
    if(normalizedKey!=="credential_storage"&&SECRET_FIELD.test(normalizedKey))return true;
    if(containsSecretMaterial(item,depth+1))return true;
  }
  return false;
}

function providerCatalog(){
  return Object.values(PROVIDER_DEFINITIONS).map(provider=>({key:provider.key,label:provider.label,connectionType:provider.connectionType,readOnly:true,credentialStorage:"external",activationMode:provider.activationMode,configuredByThebe:false}));
}

function lineagePayload(row){try{return JSON.parse(String(row?.payload_json||"{}"))}catch{return {}}}

function connectionFromLineage(rows,latestSync=null){
  let state=null;
  for(const row of rows||[]){
    const payload=lineagePayload(row),eventType=String(row?.event_type||"");
    if(eventType==="CONNECTION_REGISTERED"){
      if(state)continue;
      state={
        id:text(row?.entity_id,64),
        accountId:text(payload.accountId,64),
        providerKey:text(payload.providerKey,60),
        connectionType:text(payload.connectionType,40),
        displayName:text(payload.displayName,120),
        status:"not_configured",
        readOnly:payload.readOnly===true,
        credentialStorage:text(payload.credentialStorage,20),
        secretMaterialStored:payload.secretMaterialStored===false?false:true,
        createdAt:row?.occurred_at||null,
        updatedAt:row?.occurred_at||null,
        lastSyncedAt:null,
        lastSyncStatus:null,
        lastErrorCode:null,
        lastSequence:Number(row?.sequence||0)
      };
      continue;
    }
    if(!state||eventType!=="CONNECTION_STATUS_CHANGED")continue;
    const next=text(payload.status,30),previous=text(payload.previousStatus,30);
    state.lastSequence=Math.max(state.lastSequence,Number(row?.sequence||0));
    if(state.status==="revoked")continue;
    if(next==="revoked"){
      state.status="revoked";state.updatedAt=row?.occurred_at||state.updatedAt;continue;
    }
    if(CONNECTION_STATUSES.has(next)&&state.status===previous){
      state.status=next;state.updatedAt=row?.occurred_at||state.updatedAt;
      state.lastErrorCode=next==="error"?text(payload.errorCode,120)||"connection_error":null;
    }
  }
  if(state&&latestSync){
    const payload=lineagePayload(latestSync);
    state.lastSyncedAt=latestSync.occurred_at||null;
    state.lastSyncStatus=text(payload.status,40)||"completed";
    state.lastErrorCode=text(payload.errorCode,120)||state.lastErrorCode;
    state.lastSequence=Math.max(state.lastSequence,Number(latestSync.sequence||0));
  }
  return state;
}

async function appendLineage({env,tenantId,userId,eventType,entityType,entityId,payload,sha256Hex,id}){
  for(let attempt=0;attempt<3;attempt++){
    const prior=await env.DB.prepare("SELECT sequence,event_hash FROM finance_lineage WHERE tenant_id=? ORDER BY sequence DESC LIMIT 1").bind(tenantId).first();
    const sequence=Number(prior?.sequence||0)+1,previousHash=String(prior?.event_hash||"GENESIS");
    const canonical=JSON.stringify({tenantId,sequence,eventType,entityType,entityId,payload,previousHash});
    const eventHash=await sha256Hex(canonical);
    try{
      await env.DB.prepare("INSERT INTO finance_lineage(id,tenant_id,sequence,event_type,entity_type,entity_id,payload_json,previous_hash,event_hash,actor_user_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(id(),tenantId,sequence,eventType,entityType,entityId,JSON.stringify(payload),previousHash,eventHash,userId).run();
      return {sequence,eventHash};
    }catch(error){if(!/unique|constraint/i.test(String(error)))throw error}
  }
  throw new Error("finance_lineage_contention");
}

async function financeSummary(env,tenantId){
  const [balances,unresolved,lastRun,imports]=await Promise.all([
    env.DB.prepare(`SELECT a.id,a.name,a.account_type,a.opening_balance_minor+COALESCE(SUM(t.amount_minor),0) balance_minor,COUNT(t.id) transaction_count
      FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id AND t.tenant_id=a.tenant_id
      WHERE a.tenant_id=? AND a.status='active' GROUP BY a.id,a.name,a.account_type,a.opening_balance_minor ORDER BY a.name`).bind(tenantId).all(),
    env.DB.prepare("SELECT COUNT(*) count,COALESCE(SUM(ABS(difference_minor)),0) exposure_minor FROM finance_reconciliation_runs WHERE tenant_id=? AND status='exception'").bind(tenantId).first(),
    env.DB.prepare("SELECT id,status,statement_to,difference_minor,created_at FROM finance_reconciliation_runs WHERE tenant_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(tenantId).first(),
    env.DB.prepare("SELECT COUNT(*) count,COALESCE(SUM(imported_count),0) transactions,MAX(created_at) last_import_at FROM finance_import_batches WHERE tenant_id=? AND status='completed'").bind(tenantId).first()
  ]);
  const accounts=balances.results||[],cashPositionMinor=accounts.reduce((sum,x)=>sum+Number(x.balance_minor||0),0);
  const lastAt=lastRun?.created_at?Date.parse(String(lastRun.created_at).replace(" ","T")+"Z"):NaN;
  return {currency:"BWP",cashPositionMinor,accounts,imports:{count:Number(imports?.count||0),transactions:Number(imports?.transactions||0),lastImportAt:imports?.last_import_at||null},reconciliation:{unresolvedCount:Number(unresolved?.count||0),unresolvedExposureMinor:Number(unresolved?.exposure_minor||0),lastRun:lastRun||null,stale:!Number.isFinite(lastAt)||Date.now()-lastAt>7*86400000},authority:{canonical:true,providerNeutral:true,source:"finance_ledger",estimated:false}};
}

async function getFinanceConnection(env,tenantId,connectionId){
  const [stateRows,syncRow]=await Promise.all([
    env.DB.prepare("SELECT entity_id,event_type,payload_json,sequence,occurred_at,event_hash FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND entity_id=? AND event_type IN ('CONNECTION_REGISTERED','CONNECTION_STATUS_CHANGED') ORDER BY sequence ASC LIMIT 500").bind(tenantId,connectionId).all(),
    env.DB.prepare("SELECT entity_id,event_type,payload_json,sequence,occurred_at,event_hash FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND entity_id=? AND event_type='CONNECTION_SYNC_COMPLETED' ORDER BY sequence DESC LIMIT 1").bind(tenantId,connectionId).first()
  ]);
  return connectionFromLineage(stateRows.results||[],syncRow||null);
}

async function listFinanceConnections(env,tenantId){
  const stateRows=await env.DB.prepare("SELECT entity_id,event_type,payload_json,sequence,occurred_at,event_hash FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND event_type IN ('CONNECTION_REGISTERED','CONNECTION_STATUS_CHANGED') ORDER BY sequence ASC LIMIT 5000").bind(tenantId).all();
  const groups=new Map();
  for(const row of stateRows.results||[]){const key=String(row.entity_id||"");if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  const syncRows=await env.DB.prepare(`SELECT l.entity_id,l.event_type,l.payload_json,l.sequence,l.occurred_at,l.event_hash
    FROM finance_lineage l JOIN (
      SELECT entity_id,MAX(sequence) max_sequence FROM finance_lineage
      WHERE tenant_id=? AND entity_type='finance_connection' AND event_type='CONNECTION_SYNC_COMPLETED' GROUP BY entity_id
    ) latest ON latest.entity_id=l.entity_id AND latest.max_sequence=l.sequence
    WHERE l.tenant_id=? AND l.entity_type='finance_connection' AND l.event_type='CONNECTION_SYNC_COMPLETED'`).bind(tenantId,tenantId).all();
  const latestSync=new Map((syncRows.results||[]).map(row=>[String(row.entity_id||""),row]));
  return [...groups.entries()].map(([connectionId,rows])=>connectionFromLineage(rows,latestSync.get(connectionId)||null)).filter(Boolean).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}

async function adapterConnectionForImport({env,tenantId,connectionId,accountId,provider}){
  if(!connectionId)return {ok:false,error:"finance_connection_id_required",status:400};
  const connection=await getFinanceConnection(env,tenantId,connectionId);
  if(!connection)return {ok:false,error:"finance_connection_not_found",status:404};
  if(connection.status!=="active")return {ok:false,error:"finance_connection_not_active",status:409,connection};
  if(connection.readOnly!==true||connection.secretMaterialStored!==false||connection.credentialStorage!=="external")return {ok:false,error:"finance_connection_policy_violation",status:409,connection};
  if(connection.accountId!==accountId)return {ok:false,error:"finance_connection_account_mismatch",status:409,connection};
  if(connection.providerKey!==provider)return {ok:false,error:"finance_connection_provider_mismatch",status:409,connection};
  return {ok:true,connection};
}

async function recordAdapterSyncCompletion({env,auth,connection,idempotencyKey,batchId,rowCount,importedCount,duplicateCount,id,sha256Hex,writeAudit}){
  if(!connection)return;
  const idempotencyKeyHash=await sha256Hex(JSON.stringify([connection.id,idempotencyKey]));
  const prior=await env.DB.prepare("SELECT sequence FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND entity_id=? AND event_type='CONNECTION_SYNC_COMPLETED' AND json_extract(payload_json,'$.idempotencyKeyHash')=? LIMIT 1").bind(auth.tenant_id,connection.id,idempotencyKeyHash).first();
  if(prior)return;
  await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_SYNC_COMPLETED",entityType:"finance_connection",entityId:connection.id,payload:{providerKey:connection.providerKey,idempotencyKeyHash,batchId,rowCount,importedCount,duplicateCount,status:"completed"},sha256Hex,id});
  await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CONNECTION_SYNC_COMPLETED",{connectionId:connection.id,providerKey:connection.providerKey,batchId,rowCount,importedCount,duplicateCount});
}

async function verifyExistingImportRequest({env,tenantId,existing,accountId,sourceType,provider,expectedRowCount,expectedFingerprints}){
  const actualProvider=existing?.provider===null||existing?.provider===undefined?"":String(existing.provider);
  const expectedProvider=provider===null||provider===undefined?"":String(provider);
  if(String(existing?.account_id||"")!==accountId||String(existing?.source_type||"")!==sourceType||actualProvider!==expectedProvider||Number(existing?.row_count)!==expectedRowCount)return false;
  const rows=await env.DB.prepare("SELECT source_fingerprint FROM finance_transactions WHERE tenant_id=? AND import_batch_id=? ORDER BY source_fingerprint").bind(tenantId,existing.id).all();
  return sameFingerprintSet((rows.results||[]).map(row=>row.source_fingerprint),expectedFingerprints);
}

function connectionActionPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/connections\/([^/]+)\/(activate|pause|resume|revoke)$/);
  return match?{connectionId:text(match[1],64),action:match[2]}:null;
}

function connectionSyncRunsPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/connections\/([^/]+)\/sync-runs$/);
  return match?{connectionId:text(match[1],64)}:null;
}

export async function handleFinanceRequest({request,url,env,auth,json,readJson,id,writeAudit,roleAllowed,sha256Hex,enqueueTenantAlert=null,whatsappTemplateAvailable=()=>false}){
  if(!url.pathname.startsWith("/api/finance"))return null;
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(url.pathname==="/api/finance/summary"&&request.method==="GET")return json(await financeSummary(env,auth.tenant_id));
  if(url.pathname==="/api/finance/accounts"&&request.method==="GET"){
    const rows=await env.DB.prepare("SELECT id,name,account_type,currency,opening_balance_minor,status,created_at FROM finance_accounts WHERE tenant_id=? ORDER BY name").bind(auth.tenant_id).all();
    return json({items:rows.results||[],currency:"BWP"});
  }
  if(url.pathname==="/api/finance/accounts"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024}),name=text(body.name,120),accountType=text(body.accountType,30),opening=integer(body.openingBalanceMinor??0);
    if(name.length<2)return json({error:"account_name_required"},400);
    if(!ACCOUNT_TYPES.has(accountType))return json({error:"invalid_account_type"},400);
    if(opening===null)return json({error:"invalid_opening_balance_minor"},400);
    const accountId=id();
    try{await env.DB.prepare("INSERT INTO finance_accounts(id,tenant_id,name,account_type,currency,opening_balance_minor,created_by_user_id) VALUES(?,?,?,?, 'BWP',?,?)").bind(accountId,auth.tenant_id,name,accountType,opening,auth.user_id).run()}
    catch(error){if(/unique|constraint/i.test(String(error)))return json({error:"finance_account_exists"},409);throw error}
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"ACCOUNT_CREATED",entityType:"finance_account",entityId:accountId,payload:{name,accountType,openingBalanceMinor:opening,currency:"BWP"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_ACCOUNT_CREATED",{accountId,accountType,currency:"BWP"});
    return json({ok:true,id:accountId,currency:"BWP"},201);
  }
  if(url.pathname==="/api/finance/connections"&&request.method==="GET"){
    const items=await listFinanceConnections(env,auth.tenant_id);
    return json({items,providers:providerCatalog(),policy:{readOnly:true,credentialStorage:"external",secretMaterialStored:false,providerWriteBack:false,moneyMovement:false,registry:"finance_lineage"}});
  }
  if(url.pathname==="/api/finance/connections"&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:16*1024});
    if(containsSecretMaterial(body))return json({error:"finance_connection_secret_material_forbidden"},400);
    if(Object.prototype.hasOwnProperty.call(body,"externalAccountRef")||Object.prototype.hasOwnProperty.call(body,"external_account_ref"))return json({error:"external_account_reference_not_accepted"},400);
    const accountId=text(body.accountId,64),providerKey=text(body.providerKey||body.provider,60),provider=PROVIDER_DEFINITIONS[providerKey],displayName=text(body.displayName,120);
    if(!provider)return json({error:"unsupported_finance_provider",providers:providerCatalog().map(item=>item.key)},400);
    if(displayName.length<2)return json({error:"connection_display_name_required"},400);
    const account=await env.DB.prepare("SELECT id FROM finance_accounts WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(accountId,auth.tenant_id).first();
    if(!account)return json({error:"finance_account_not_found"},404);
    const count=await env.DB.prepare("SELECT COUNT(DISTINCT entity_id) count FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND event_type='CONNECTION_REGISTERED'").bind(auth.tenant_id).first();
    const connectionId=(await sha256Hex(JSON.stringify([auth.tenant_id,accountId,provider.key]))).slice(0,64),existing=await getFinanceConnection(env,auth.tenant_id,connectionId);
    if(existing)return json({error:"finance_connection_exists",id:connectionId,status:existing.status},409);
    if(Number(count?.count||0)>=MAX_CONNECTIONS)return json({error:"finance_connection_limit_reached",maxConnections:MAX_CONNECTIONS},409);
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_REGISTERED",entityType:"finance_connection",entityId:connectionId,payload:{accountId,providerKey:provider.key,connectionType:provider.connectionType,displayName,status:"not_configured",readOnly:true,credentialStorage:"external",secretMaterialStored:false},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CONNECTION_REGISTERED",{connectionId,accountId,providerKey:provider.key,status:"not_configured",readOnly:true,registry:"finance_lineage"});
    return json({ok:true,id:connectionId,status:"not_configured",provider:{key:provider.key,label:provider.label,connectionType:provider.connectionType,activationMode:provider.activationMode},policy:{readOnly:true,credentialStorage:"external",secretMaterialStored:false,registry:"finance_lineage"}},201);
  }
  const syncRunsRoute=connectionSyncRunsPath(url.pathname);
  if(syncRunsRoute&&request.method==="GET"){
    const connection=await getFinanceConnection(env,auth.tenant_id,syncRunsRoute.connectionId);
    if(!connection)return json({error:"finance_connection_not_found"},404);
    const rows=await env.DB.prepare("SELECT payload_json,sequence,occurred_at,event_hash FROM finance_lineage WHERE tenant_id=? AND entity_type='finance_connection' AND entity_id=? AND event_type='CONNECTION_SYNC_COMPLETED' ORDER BY sequence DESC LIMIT 100").bind(auth.tenant_id,connection.id).all();
    const items=(rows.results||[]).map(row=>{const payload=lineagePayload(row);return {sequence:Number(row.sequence||0),occurredAt:row.occurred_at||null,eventHash:row.event_hash||null,batchId:text(payload.batchId,64)||null,idempotencyKeyHash:text(payload.idempotencyKeyHash,64)||null,status:text(payload.status,40)||"completed",rowCount:Number(payload.rowCount||0),importedCount:Number(payload.importedCount||0),duplicateCount:Number(payload.duplicateCount||0)}});
    return json({connection:{id:connection.id,providerKey:connection.providerKey,status:connection.status,readOnly:true},items});
  }
  const connectionAction=connectionActionPath(url.pathname);
  if(connectionAction&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:8*1024});
    if(containsSecretMaterial(body))return json({error:"finance_connection_secret_material_forbidden"},400);
    const connection=await getFinanceConnection(env,auth.tenant_id,connectionAction.connectionId);
    if(!connection)return json({error:"finance_connection_not_found"},404);
    const provider=PROVIDER_DEFINITIONS[connection.providerKey];
    let nextStatus=null;
    if(connectionAction.action==="activate"){
      if(connection.status==="revoked")return json({error:"finance_connection_revoked"},409);
      if(connection.status==="active")return json({ok:true,id:connection.id,status:"active",replayed:true});
      if(connection.providerKey!=="generic_adapter")return json({error:"provider_onboarding_required",providerKey:connection.providerKey,activationMode:provider?.activationMode||"provider_onboarding_required"},409);
      if(connection.status!=="not_configured"&&connection.status!=="error")return json({error:"finance_connection_not_activatable",status:connection.status},409);
      if(body.confirmReadOnly!==true||text(body.credentialStorage,20)!=="external")return json({error:"read_only_external_credential_attestation_required"},400);
      nextStatus="active";
    }else if(connectionAction.action==="pause"){
      if(connection.status!=="active")return json({error:"finance_connection_not_active"},409);
      nextStatus="paused";
    }else if(connectionAction.action==="resume"){
      if(connection.status!=="paused")return json({error:"finance_connection_not_paused"},409);
      nextStatus="active";
    }else if(connectionAction.action==="revoke"){
      if(connection.status==="revoked")return json({ok:true,id:connection.id,status:"revoked",replayed:true});
      nextStatus="revoked";
    }
    if(!CONNECTION_STATUSES.has(nextStatus))return json({error:"invalid_finance_connection_status"},400);
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_STATUS_CHANGED",entityType:"finance_connection",entityId:connection.id,payload:{providerKey:connection.providerKey,previousStatus:connection.status,status:nextStatus,readOnly:true},sha256Hex,id});
    const resolved=await getFinanceConnection(env,auth.tenant_id,connection.id);
    if(!resolved||resolved.status!==nextStatus)return json({error:"finance_connection_state_conflict",status:resolved?.status||connection.status},409);
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CONNECTION_STATUS_CHANGED",{connectionId:connection.id,providerKey:connection.providerKey,previousStatus:connection.status,status:nextStatus,readOnly:true,registry:"finance_lineage"});
    return json({ok:true,id:connection.id,status:nextStatus,providerKey:connection.providerKey,readOnly:true});
  }
  if(url.pathname==="/api/finance/imports"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:768*1024}),accountId=text(body.accountId,64),sourceType=text(body.sourceType||"manual",20),rows=Array.isArray(body.rows)?body.rows:null;
    const idempotencyKey=text(request.headers.get("idempotency-key")||body.idempotencyKey,120),provider=text(body.provider,60)||null,connectionId=text(body.connectionId,64);
    if(!SOURCE_TYPES.has(sourceType)||sourceType==="adapter"&&!provider)return json({error:"invalid_source_type"},400);
    if(sourceType==="adapter"&&containsSecretMaterial(body))return json({error:"finance_connection_secret_material_forbidden"},400);
    if(!idempotencyKey)return json({error:"idempotency_key_required"},400);
    if(!rows||!rows.length||rows.length>MAX_IMPORT_ROWS)return json({error:"invalid_import_rows",maxRows:MAX_IMPORT_ROWS},400);
    const account=await env.DB.prepare("SELECT id FROM finance_accounts WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(accountId,auth.tenant_id).first();
    if(!account)return json({error:"finance_account_not_found"},404);
    let adapterConnection=null;
    if(sourceType==="adapter"){
      if(!PROVIDER_DEFINITIONS[provider])return json({error:"unsupported_finance_provider"},400);
      const checked=await adapterConnectionForImport({env,tenantId:auth.tenant_id,connectionId,accountId,provider});
      if(!checked.ok)return json({error:checked.error},checked.status);
      adapterConnection=checked.connection;
    }
    const normalized=[];for(let i=0;i<rows.length;i++){const item=normalizeFinanceRow(rows[i],i);if(!item.ok)return json({error:item.error,row:i},400);normalized.push(item.row)}
    const fingerprintProvider=adapterConnection?`${provider}:${adapterConnection.id}`:provider,expectedFingerprints=[];
    for(let index=0;index<normalized.length;index++){
      const row=normalized[index];
      expectedFingerprints.push(await sha256Hex(JSON.stringify(sourceFingerprintBasis({tenantId:auth.tenant_id,accountId,sourceType,provider:fingerprintProvider,idempotencyKey,row,index}))));
    }
    const existing=await env.DB.prepare("SELECT id,account_id,source_type,provider,row_count,imported_count,duplicate_count,status FROM finance_import_batches WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(auth.tenant_id,idempotencyKey).first();
    if(existing){
      const replayMatches=await verifyExistingImportRequest({env,tenantId:auth.tenant_id,existing,accountId,sourceType,provider,expectedRowCount:normalized.length,expectedFingerprints});
      if(!replayMatches)return json({error:"idempotency_key_conflict"},409);
      if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId:existing.id,rowCount:Number(existing.row_count||0),importedCount:Number(existing.imported_count||0),duplicateCount:Number(existing.duplicate_count||0),id,sha256Hex,writeAudit});
      return json({ok:true,id:existing.id,importedCount:Number(existing.imported_count||0),duplicateCount:Number(existing.duplicate_count||0),status:existing.status,replayed:true,connectionId:adapterConnection?.id||undefined});
    }
    const batchId=id(),packed=[];
    for(let index=0;index<normalized.length;index++){
      const row=normalized[index];
      packed.push({id:id(),tenantId:auth.tenant_id,accountId,batchId,postedOn:row.postedOn,description:row.description,reference:row.reference,amountMinor:row.amountMinor,sourceType,fingerprint:expectedFingerprints[index]});
    }
    const packedJson=JSON.stringify(packed);
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO finance_import_batches(id,tenant_id,account_id,source_type,provider,idempotency_key,status,row_count,created_by_user_id) VALUES(?,?,?,?,?,?,'processing',?,?)").bind(batchId,auth.tenant_id,accountId,sourceType,provider,idempotencyKey,normalized.length,auth.user_id),
        env.DB.prepare(`INSERT OR IGNORE INTO finance_transactions(id,tenant_id,account_id,import_batch_id,posted_on,description,reference,amount_minor,currency,source_type,source_fingerprint)
          SELECT json_extract(value,'$.id'),json_extract(value,'$.tenantId'),json_extract(value,'$.accountId'),json_extract(value,'$.batchId'),json_extract(value,'$.postedOn'),json_extract(value,'$.description'),json_extract(value,'$.reference'),json_extract(value,'$.amountMinor'),'BWP',json_extract(value,'$.sourceType'),json_extract(value,'$.fingerprint') FROM json_each(?)`).bind(packedJson),
        env.DB.prepare("UPDATE finance_import_batches SET status='completed',imported_count=(SELECT COUNT(*) FROM finance_transactions WHERE import_batch_id=?),duplicate_count=row_count-(SELECT COUNT(*) FROM finance_transactions WHERE import_batch_id=?),completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='processing'").bind(batchId,batchId,batchId,auth.tenant_id)
      ]);
    }catch(error){
      if(/unique|constraint/i.test(String(error))){
        const replay=await env.DB.prepare("SELECT id,account_id,source_type,provider,row_count,imported_count,duplicate_count,status FROM finance_import_batches WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(auth.tenant_id,idempotencyKey).first();
        if(replay){
          const replayMatches=await verifyExistingImportRequest({env,tenantId:auth.tenant_id,existing:replay,accountId,sourceType,provider,expectedRowCount:normalized.length,expectedFingerprints});
          if(!replayMatches)return json({error:"idempotency_key_conflict"},409);
          if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId:replay.id,rowCount:Number(replay.row_count||0),importedCount:Number(replay.imported_count||0),duplicateCount:Number(replay.duplicate_count||0),id,sha256Hex,writeAudit});
          return json({ok:true,id:replay.id,importedCount:Number(replay.imported_count||0),duplicateCount:Number(replay.duplicate_count||0),status:replay.status,replayed:true,connectionId:adapterConnection?.id||undefined});
        }
      }
      throw error;
    }
    const completed=await env.DB.prepare("SELECT imported_count,duplicate_count,status FROM finance_import_batches WHERE id=? AND tenant_id=? LIMIT 1").bind(batchId,auth.tenant_id).first();
    const imported=Number(completed?.imported_count||0),duplicates=Number(completed?.duplicate_count||0);
    if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId,rowCount:normalized.length,importedCount:imported,duplicateCount:duplicates,id,sha256Hex,writeAudit});
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"TRANSACTIONS_IMPORTED",entityType:"finance_import_batch",entityId:batchId,payload:{accountId,sourceType,provider,connectionId:adapterConnection?.id||null,rowCount:normalized.length,importedCount:imported,duplicateCount:duplicates},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_TRANSACTIONS_IMPORTED",{batchId,accountId,sourceType,provider,connectionId:adapterConnection?.id||null,importedCount:imported,duplicateCount:duplicates});
    return json({ok:true,id:batchId,importedCount:imported,duplicateCount:duplicates,currency:"BWP",connectionId:adapterConnection?.id||undefined},201);
  }
  if(url.pathname==="/api/finance/transactions"&&request.method==="GET"){
    const accountId=text(url.searchParams.get("accountId"),64),limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit")||100)));
    const result=accountId?await env.DB.prepare("SELECT id,account_id,posted_on,description,reference,amount_minor,currency,source_type,created_at FROM finance_transactions WHERE tenant_id=? AND account_id=? ORDER BY posted_on DESC,created_at DESC LIMIT ?").bind(auth.tenant_id,accountId,limit).all():await env.DB.prepare("SELECT id,account_id,posted_on,description,reference,amount_minor,currency,source_type,created_at FROM finance_transactions WHERE tenant_id=? ORDER BY posted_on DESC,created_at DESC LIMIT ?").bind(auth.tenant_id,limit).all();
    return json({items:result.results||[],currency:"BWP"});
  }
  if(url.pathname==="/api/finance/reconciliations"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:32*1024}),accountId=text(body.accountId,64),from=text(body.statementFrom,10),to=text(body.statementTo,10),opening=integer(body.openingBalanceMinor),closing=integer(body.closingBalanceMinor);
    if(!validDate(from)||!validDate(to)||from>to)return json({error:"invalid_statement_period"},400);
    if(opening===null||closing===null)return json({error:"invalid_statement_balance_minor"},400);
    const account=await env.DB.prepare("SELECT id FROM finance_accounts WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(accountId,auth.tenant_id).first();
    if(!account)return json({error:"finance_account_not_found"},404);
    const tx=await env.DB.prepare("SELECT id,posted_on,amount_minor,source_fingerprint FROM finance_transactions WHERE tenant_id=? AND account_id=? AND posted_on>=? AND posted_on<=? ORDER BY posted_on,id").bind(auth.tenant_id,accountId,from,to).all();
    const items=tx.results||[],movement=items.reduce((sum,x)=>sum+Number(x.amount_minor||0),0),bookClosing=opening+movement,difference=closing-bookClosing,status=difference===0?"reconciled":"exception";
    const snapshotHash=await sha256Hex(JSON.stringify({accountId,from,to,opening,closing,items:items.map(x=>[x.id,x.amount_minor,x.source_fingerprint])})),runId=id();
    await env.DB.prepare("INSERT INTO finance_reconciliation_runs(id,tenant_id,account_id,statement_from,statement_to,opening_balance_minor,statement_closing_minor,book_closing_minor,difference_minor,currency,status,transaction_count,snapshot_hash,created_by_user_id) VALUES(?,?,?,?,?,?,?,?,?, 'BWP',?,?,?,?)").bind(runId,auth.tenant_id,accountId,from,to,opening,closing,bookClosing,difference,status,items.length,snapshotHash,auth.user_id).run();
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"RECONCILIATION_COMPLETED",entityType:"finance_reconciliation",entityId:runId,payload:{accountId,statementFrom:from,statementTo:to,openingBalanceMinor:opening,statementClosingMinor:closing,bookClosingMinor:bookClosing,differenceMinor:difference,status,transactionCount:items.length,snapshotHash},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_RECONCILIATION_COMPLETED",{runId,accountId,status,differenceMinor:difference,transactionCount:items.length,snapshotHash});
    let whatsappAlert={eligible:false,queued:false};
    if(status==="exception"&&enqueueTenantAlert&&whatsappTemplateAvailable("finance_reconciliation_exception")){
      const accountName=String((await env.DB.prepare("SELECT name FROM finance_accounts WHERE id=? AND tenant_id=? LIMIT 1").bind(accountId,auth.tenant_id).first())?.name||"Finance account");
      const alert=await enqueueTenantAlert(env,{tenantId:auth.tenant_id,templateKey:"finance_reconciliation_exception",subject:"Finance reconciliation needs review",payload:{accountName,statementPeriod:`${from} to ${to}`,differenceBwp:(Math.abs(difference)/100).toFixed(2)},dedupeKey:`finance-reconciliation:${accountId}:${from}:${to}:${snapshotHash}`,externalPriority:"urgent"});
      whatsappAlert={eligible:true,queued:!!alert?.ok};
    }
    return json({ok:true,id:runId,status,openingBalanceMinor:opening,statementClosingMinor:closing,bookClosingMinor:bookClosing,differenceMinor:difference,transactionCount:items.length,snapshotHash,currency:"BWP",whatsappAlert},201);
  }
  if(url.pathname==="/api/finance/reconciliations"&&request.method==="GET"){
    const result=await env.DB.prepare("SELECT id,account_id,statement_from,statement_to,opening_balance_minor,statement_closing_minor,book_closing_minor,difference_minor,currency,status,transaction_count,snapshot_hash,created_at FROM finance_reconciliation_runs WHERE tenant_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100").bind(auth.tenant_id).all();
    return json({items:result.results||[],currency:"BWP"});
  }
  return json({error:"not_found"},404);
}

export const __financeTest=Object.freeze({normalizeFinanceRow,validDate,sourceFingerprintBasis,sameFingerprintSet,ACCOUNT_TYPES,SOURCE_TYPES,MAX_IMPORT_ROWS});
export const __financeConnectionTest=Object.freeze({PROVIDER_DEFINITIONS,CONNECTION_STATUSES,containsSecretMaterial,providerCatalog,connectionActionPath,connectionSyncRunsPath,connectionFromLineage,MAX_CONNECTIONS});
