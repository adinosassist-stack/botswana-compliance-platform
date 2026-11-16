/**
 * Inert, staging-only atomic AI budget reservation adapter.
 * No route wiring, migration execution or provider invocation.
 */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function reserveAiBudget(db,{tenantId,period,requestId,amountMicroUsd}={}){
 if(!db||typeof db.prepare!=="function")throw Error("ai_budget_unavailable");
 if(!ID.test(String(tenantId||""))||!ID.test(String(requestId||""))||
    !PERIOD.test(String(period||""))||!Number.isSafeInteger(amountMicroUsd)||amountMicroUsd<=0)
   throw Error("ai_budget_invalid_request");
 try{
   // No INSERT OR IGNORE: duplicate request IDs must not masquerade as new
   // budget grants. Trigger enforces the monetary ceiling atomically.
   await db.prepare(`INSERT INTO ai_budget_reservation
     (tenant_id,period,request_id,amount_micro_usd) VALUES (?,?,?,?)`)
     .bind(tenantId,period,requestId,amountMicroUsd).run();
   return {reserved:true};
 }catch{
   // Do not expose DB internals or accidentally allow a provider call.
   throw Error("ai_budget_reservation_denied");
 }
}
