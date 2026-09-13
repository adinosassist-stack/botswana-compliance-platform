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
  return await env.DB.prepare("SELECT id,tenant_id,finance_account_id,provider_key,connection_type,display_name,external_account_ref,status,read_only,credential_storage,secret_material_stored,last_synced_at,last_sync_status,last_error_code,created_at,updated_at FROM finance_connections WHERE id=? AND tenant_id=? LIMIT 1").bind(connectionId,tenantId).first();
}

async function adapterConnectionForImport({env,tenantId,connectionId,accountId,provider}){
  if(!connectionId)return {ok:false,error:"finance_connection_id_required",status:400};
  const connection=await getFinanceConnection(env,tenantId,connectionId);
  if(!connection)return {ok:false,error:"finance_connection_not_found",status:404};
  if(connection.status!=="active")return {ok:false,error:"finance_connection_not_active",status:409,connection};
  if(Number(connection.read_only)!==1||Number(connection.secret_material_stored)!==0||connection.credential_storage!=="external")return {ok:false,error:"finance_connection_policy_violation",status:409,connection};
  if(connection.finance_account_id!==accountId)return {ok:false,error:"finance_connection_account_mismatch",status:409,connection};
  if(connection.provider_key!==provider)return {ok:false,error:"finance_connection_provider_mismatch",status:409,connection};
  return {ok:true,connection};
}

async function recordAdapterSyncCompletion({env,auth,connection,idempotencyKey,batchId,rowCount,importedCount,duplicateCount,id}){
  if(!connection)return;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO finance_connection_sync_runs(id,tenant_id,connection_id,import_batch_id,requested_by_user_id,idempotency_key,status,row_count,imported_count,duplicate_count,completed_at) VALUES(?,?,?,?,?,?,'completed',?,?,?,CURRENT_TIMESTAMP)").bind(id(),auth.tenant_id,connection.id,batchId,auth.user_id,idempotencyKey,rowCount,importedCount,duplicateCount),
    env.DB.prepare("UPDATE finance_connections SET last_synced_at=CURRENT_TIMESTAMP,last_sync_status='completed',last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active'").bind(connection.id,auth.tenant_id)
  ]);
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
    const rows=await env.DB.prepare("SELECT id,finance_account_id,provider_key,connection_type,display_name,external_account_ref,status,read_only,credential_storage,last_synced_at,last_sync_status,last_error_code,created_at,updated_at FROM finance_connections WHERE tenant_id=? ORDER BY created_at DESC").bind(auth.tenant_id).all();
    return json({items:rows.results||[],providers:providerCatalog(),policy:{readOnly:true,credentialStorage:"external",secretMaterialStored:false,providerWriteBack:false,moneyMovement:false}});
  }
  if(url.pathname==="/api/finance/connections"&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:16*1024});
    if(containsSecretMaterial(body))return json({error:"finance_connection_secret_material_forbidden"},400);
    const accountId=text(body.accountId,64),providerKey=text(body.providerKey||body.provider,60),provider=PROVIDER_DEFINITIONS[providerKey],displayName=text(body.displayName,120),externalAccountRef=text(body.externalAccountRef,160);
    if(!provider)return json({error:"unsupported_finance_provider",providers:providerCatalog().map(item=>item.key)},400);
    if(displayName.length<2)return json({error:"connection_display_name_required"},400);
    const account=await env.DB.prepare("SELECT id FROM finance_accounts WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(accountId,auth.tenant_id).first();
    if(!account)return json({error:"finance_account_not_found"},404);
    const connectionId=id();
    try{
      await env.DB.prepare("INSERT INTO finance_connections(id,tenant_id,finance_account_id,provider_key,connection_type,display_name,external_account_ref,status,read_only,credential_storage,secret_material_stored,created_by_user_id) VALUES(?,?,?,?,?,?,?,'not_configured',1,'external',0,?)").bind(connectionId,auth.tenant_id,accountId,provider.key,provider.connectionType,displayName,externalAccountRef,auth.user_id).run();
    }catch(error){if(/unique|constraint/i.test(String(error)))return json({error:"finance_connection_exists"},409);throw error}
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_REGISTERED",entityType:"finance_connection",entityId:connectionId,payload:{accountId,providerKey:provider.key,connectionType:provider.connectionType,status:"not_configured",readOnly:true,credentialStorage:"external",secretMaterialStored:false},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CONNECTION_REGISTERED",{connectionId,accountId,providerKey:provider.key,status:"not_configured",readOnly:true});
    return json({ok:true,id:connectionId,status:"not_configured",provider:{key:provider.key,label:provider.label,connectionType:provider.connectionType,activationMode:provider.activationMode},policy:{readOnly:true,credentialStorage:"external",secretMaterialStored:false}},201);
  }
  const syncRunsRoute=connectionSyncRunsPath(url.pathname);
  if(syncRunsRoute&&request.method==="GET"){
    const connection=await getFinanceConnection(env,auth.tenant_id,syncRunsRoute.connectionId);
    if(!connection)return json({error:"finance_connection_not_found"},404);
    const rows=await env.DB.prepare("SELECT id,import_batch_id,idempotency_key,status,row_count,imported_count,duplicate_count,error_code,started_at,completed_at FROM finance_connection_sync_runs WHERE tenant_id=? AND connection_id=? ORDER BY started_at DESC LIMIT 100").bind(auth.tenant_id,connection.id).all();
    return json({connection:{id:connection.id,providerKey:connection.provider_key,status:connection.status,readOnly:true},items:rows.results||[]});
  }
  const connectionAction=connectionActionPath(url.pathname);
  if(connectionAction&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:8*1024});
    if(containsSecretMaterial(body))return json({error:"finance_connection_secret_material_forbidden"},400);
    const connection=await getFinanceConnection(env,auth.tenant_id,connectionAction.connectionId);
    if(!connection)return json({error:"finance_connection_not_found"},404);
    const provider=PROVIDER_DEFINITIONS[connection.provider_key];
    let nextStatus=null;
    if(connectionAction.action==="activate"){
      if(connection.status==="revoked")return json({error:"finance_connection_revoked"},409);
      if(connection.status==="active")return json({ok:true,id:connection.id,status:"active",replayed:true});
      if(connection.provider_key!=="generic_adapter")return json({error:"provider_onboarding_required",providerKey:connection.provider_key,activationMode:provider?.activationMode||"provider_onboarding_required"},409);
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
    await env.DB.prepare("UPDATE finance_connections SET status=?,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(nextStatus,connection.id,auth.tenant_id).run();
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_STATUS_CHANGED",entityType:"finance_connection",entityId:connection.id,payload:{providerKey:connection.provider_key,previousStatus:connection.status,status:nextStatus,readOnly:true},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CONNECTION_STATUS_CHANGED",{connectionId:connection.id,providerKey:connection.provider_key,previousStatus:connection.status,status:nextStatus,readOnly:true});
    return json({ok:true,id:connection.id,status:nextStatus,providerKey:connection.provider_key,readOnly:true});
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
    const existing=await env.DB.prepare("SELECT id,row_count,imported_count,duplicate_count,status FROM finance_import_batches WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(auth.tenant_id,idempotencyKey).first();
    if(existing){
      if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId:existing.id,rowCount:Number(existing.row_count||0),importedCount:Number(existing.imported_count||0),duplicateCount:Number(existing.duplicate_count||0),id});
      return json({ok:true,id:existing.id,importedCount:Number(existing.imported_count||0),duplicateCount:Number(existing.duplicate_count||0),status:existing.status,replayed:true,connectionId:adapterConnection?.id||undefined});
    }
    const normalized=[];for(let i=0;i<rows.length;i++){const item=normalizeFinanceRow(rows[i],i);if(!item.ok)return json({error:item.error,row:i},400);normalized.push(item.row)}
    const batchId=id(),packed=[],fingerprintProvider=adapterConnection?`${provider}:${adapterConnection.id}`:provider;
    for(let index=0;index<normalized.length;index++){
      const row=normalized[index];
      const fingerprint=await sha256Hex(JSON.stringify(sourceFingerprintBasis({tenantId:auth.tenant_id,accountId,sourceType,provider:fingerprintProvider,idempotencyKey,row,index})));
      packed.push({id:id(),tenantId:auth.tenant_id,accountId,batchId,postedOn:row.postedOn,description:row.description,reference:row.reference,amountMinor:row.amountMinor,sourceType,fingerprint});
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
        const replay=await env.DB.prepare("SELECT id,row_count,imported_count,duplicate_count,status FROM finance_import_batches WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(auth.tenant_id,idempotencyKey).first();
        if(replay){
          if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId:replay.id,rowCount:Number(replay.row_count||0),importedCount:Number(replay.imported_count||0),duplicateCount:Number(replay.duplicate_count||0),id});
          return json({ok:true,id:replay.id,importedCount:Number(replay.imported_count||0),duplicateCount:Number(replay.duplicate_count||0),status:replay.status,replayed:true,connectionId:adapterConnection?.id||undefined});
        }
      }
      throw error;
    }
    const completed=await env.DB.prepare("SELECT imported_count,duplicate_count,status FROM finance_import_batches WHERE id=? AND tenant_id=? LIMIT 1").bind(batchId,auth.tenant_id).first();
    const imported=Number(completed?.imported_count||0),duplicates=Number(completed?.duplicate_count||0);
    if(adapterConnection)await recordAdapterSyncCompletion({env,auth,connection:adapterConnection,idempotencyKey,batchId,rowCount:normalized.length,importedCount:imported,duplicateCount:duplicates,id});
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

export const __financeTest=Object.freeze({normalizeFinanceRow,validDate,sourceFingerprintBasis,ACCOUNT_TYPES,SOURCE_TYPES,MAX_IMPORT_ROWS});
export const __financeConnectionTest=Object.freeze({PROVIDER_DEFINITIONS,CONNECTION_STATUSES,containsSecretMaterial,providerCatalog,connectionActionPath,connectionSyncRunsPath});
