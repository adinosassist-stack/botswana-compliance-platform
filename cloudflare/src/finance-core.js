const ACCOUNT_TYPES=new Set(["bank","cash","mobile_money","clearing"]);
const SOURCE_TYPES=new Set(["manual","csv","adapter"]);
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPORT_ROWS=1000;
const text=(value,max=240)=>String(value??"").trim().slice(0,max);
const integer=value=>Number.isSafeInteger(Number(value))?Number(value):null;

function validDate(value){
  const v=text(value,10);
  if(!ISO_DATE.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}

function normalizeFinanceRow(row,index=0){
  const postedOn=text(row?.postedOn||row?.date,10),description=text(row?.description,500),reference=text(row?.reference,160);
  const amountMinor=integer(row?.amountMinor);
  if(!validDate(postedOn))return {ok:false,error:"invalid_posted_on",index};
  if(!description)return {ok:false,error:"description_required",index};
  if(amountMinor===null||amountMinor===0)return {ok:false,error:"invalid_amount_minor",index};
  return {ok:true,row:{postedOn,description,reference,amountMinor}};
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

export async function handleFinanceRequest({request,url,env,auth,json,readJson,id,writeAudit,roleAllowed,sha256Hex}){
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
  if(url.pathname==="/api/finance/imports"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:768*1024}),accountId=text(body.accountId,64),sourceType=text(body.sourceType||"manual",20),rows=Array.isArray(body.rows)?body.rows:null;
    const idempotencyKey=text(request.headers.get("idempotency-key")||body.idempotencyKey,120);
    if(!SOURCE_TYPES.has(sourceType)||sourceType==="adapter"&&!text(body.provider,60))return json({error:"invalid_source_type"},400);
    if(!idempotencyKey)return json({error:"idempotency_key_required"},400);
    if(!rows||!rows.length||rows.length>MAX_IMPORT_ROWS)return json({error:"invalid_import_rows",maxRows:MAX_IMPORT_ROWS},400);
    const account=await env.DB.prepare("SELECT id FROM finance_accounts WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(accountId,auth.tenant_id).first();
    if(!account)return json({error:"finance_account_not_found"},404);
    const existing=await env.DB.prepare("SELECT id,imported_count,duplicate_count,status FROM finance_import_batches WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(auth.tenant_id,idempotencyKey).first();
    if(existing)return json({ok:true,id:existing.id,importedCount:Number(existing.imported_count||0),duplicateCount:Number(existing.duplicate_count||0),status:existing.status,replayed:true});
    const normalized=[];for(let i=0;i<rows.length;i++){const item=normalizeFinanceRow(rows[i],i);if(!item.ok)return json({error:item.error,row:i},400);normalized.push(item.row)}
    const batchId=id(),provider=text(body.provider,60)||null;
    await env.DB.prepare("INSERT INTO finance_import_batches(id,tenant_id,account_id,source_type,provider,idempotency_key,status,row_count,created_by_user_id) VALUES(?,?,?,?,?,?,'processing',?,?)").bind(batchId,auth.tenant_id,accountId,sourceType,provider,idempotencyKey,normalized.length,auth.user_id).run();
    let imported=0,duplicates=0;
    for(const row of normalized){
      const fingerprint=await sha256Hex(JSON.stringify([auth.tenant_id,accountId,row.postedOn,row.amountMinor,row.reference,row.description]));
      const result=await env.DB.prepare("INSERT OR IGNORE INTO finance_transactions(id,tenant_id,account_id,import_batch_id,posted_on,description,reference,amount_minor,currency,source_type,source_fingerprint) VALUES(?,?,?,?,?,?,?,?, 'BWP',?,?)")
        .bind(id(),auth.tenant_id,accountId,batchId,row.postedOn,row.description,row.reference,row.amountMinor,sourceType,fingerprint).run();
      if(Number(result.meta?.changes||0)===1)imported++;else duplicates++;
    }
    await env.DB.prepare("UPDATE finance_import_batches SET status='completed',imported_count=?,duplicate_count=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='processing'").bind(imported,duplicates,batchId,auth.tenant_id).run();
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"TRANSACTIONS_IMPORTED",entityType:"finance_import_batch",entityId:batchId,payload:{accountId,sourceType,provider,rowCount:normalized.length,importedCount:imported,duplicateCount:duplicates},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_TRANSACTIONS_IMPORTED",{batchId,accountId,sourceType,provider,importedCount:imported,duplicateCount:duplicates});
    return json({ok:true,id:batchId,importedCount:imported,duplicateCount:duplicates,currency:"BWP"},201);
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
    return json({ok:true,id:runId,status,openingBalanceMinor:opening,statementClosingMinor:closing,bookClosingMinor:bookClosing,differenceMinor:difference,transactionCount:items.length,snapshotHash,currency:"BWP"},201);
  }
  if(url.pathname==="/api/finance/reconciliations"&&request.method==="GET"){
    const result=await env.DB.prepare("SELECT id,account_id,statement_from,statement_to,opening_balance_minor,statement_closing_minor,book_closing_minor,difference_minor,currency,status,transaction_count,snapshot_hash,created_at FROM finance_reconciliation_runs WHERE tenant_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100").bind(auth.tenant_id).all();
    return json({items:result.results||[],currency:"BWP"});
  }
  return json({error:"not_found"},404);
}

export const __financeTest=Object.freeze({normalizeFinanceRow,validDate,ACCOUNT_TYPES,SOURCE_TYPES,MAX_IMPORT_ROWS});
