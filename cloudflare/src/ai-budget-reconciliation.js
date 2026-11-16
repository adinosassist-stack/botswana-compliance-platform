/** Inert accounting reconciliation. Never releases reserved quota. */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function recordAiReconciliation(db,{tenantId,period,requestId,state,actualMicroUsd=null}={}){
 if(!db||typeof db.prepare!=="function")throw Error("ai_reconciliation_unavailable");
 if(!ID.test(String(tenantId||""))||!ID.test(String(requestId||""))||
    !PERIOD.test(String(period||""))||
    !((state==="completed"&&Number.isSafeInteger(actualMicroUsd)&&actualMicroUsd>=0)||
      (state==="uncertain"&&actualMicroUsd===null)))throw Error("ai_reconciliation_invalid");
 try{
  const result=await db.prepare(`INSERT INTO ai_budget_reconciliation
    (tenant_id,period,request_id,state,actual_micro_usd)
    VALUES (?,?,?,?,?)`).bind(tenantId,period,requestId,state,actualMicroUsd).run();
  if(result?.success!==true)throw Error("ai_reconciliation_write_unconfirmed");
  return {recorded:true,quotaReleased:false};
 }catch{throw Error("ai_reconciliation_write_failed")}
}
