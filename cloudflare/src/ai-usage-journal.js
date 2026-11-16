/**
 * Private, default-off AI usage journal foundation.
 * Does not activate a route, change provider selection, or enforce budgets.
 * Caller supplies an authenticated tenant ID and an isolated D1 binding.
 * The SQL migration must be independently approved before use.
 */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const fail=()=>{throw Error("ai_usage_invalid_record")};
export function normalizeAiUsageRecord(record,tenantId){
  if(!ID.test(String(tenantId||""))||!ID.test(String(record?.requestId||""))||
     !ID.test(String(record?.model||""))||!ID.test(String(record?.provider||"")))fail();
  const known=record.usageKnown===true;
  if(typeof record.usageKnown!=="boolean")fail();
  const input=record.inputTokens,output=record.outputTokens,cached=record.cachedInputTokens;
  if(known&&(!integer(input)||!integer(output)))fail();
  if(!known&&(input!==null||output!==null))fail();
  if(cached!==null&&(!integer(cached)||!known||cached>input))fail();
  return Object.freeze({tenantId:String(tenantId),requestId:record.requestId,
    provider:record.provider,model:record.model,usageKnown:known,
    inputTokens:input,outputTokens:output,cachedInputTokens:cached});
}
export async function recordAiUsage(db,tenantId,record){
  if(!db||typeof db.prepare!=="function")throw Error("ai_usage_ledger_unavailable");
  const item=normalizeAiUsageRecord(record,tenantId);
  // Plain INSERT deliberately rejects duplicate request IDs. Silently
  // ignoring a conflicting replay would report a successful journal write
  // while preserving different original usage data.
  const query=db.prepare(`INSERT INTO ai_usage_journal
    (tenant_id,request_id,provider,model,usage_known,input_tokens,output_tokens,cached_input_tokens)
    VALUES (?,?,?,?,?,?,?,?)`);
  try{
    const result=await query.bind(item.tenantId,item.requestId,item.provider,item.model,
      item.usageKnown?1:0,item.inputTokens,item.outputTokens,item.cachedInputTokens).run();
    if(result?.success!==true)throw Error("ai_usage_write_unconfirmed");
    return {recorded:true};
  }catch{
    // Treat duplicates, storage errors, and unknown outcomes conservatively.
    throw Error("ai_usage_write_failed");
  }
}
export async function getTenantAiUsage(db,tenantId){
  if(!ID.test(String(tenantId||""))||!db||typeof db.prepare!=="function")throw Error("ai_usage_ledger_unavailable");
  const row=await db.prepare(`SELECT COUNT(*) AS requests,
    COALESCE(SUM(CASE WHEN usage_known=1 THEN input_tokens ELSE 0 END),0) AS input_tokens,
    COALESCE(SUM(CASE WHEN usage_known=1 THEN output_tokens ELSE 0 END),0) AS output_tokens,
    SUM(CASE WHEN usage_known=0 THEN 1 ELSE 0 END) AS unknown_requests
    FROM ai_usage_journal WHERE tenant_id=?`).bind(tenantId).first();
  return {requests:Number(row?.requests||0),inputTokens:Number(row?.input_tokens||0),
    outputTokens:Number(row?.output_tokens||0),unknownRequests:Number(row?.unknown_requests||0)};
}
