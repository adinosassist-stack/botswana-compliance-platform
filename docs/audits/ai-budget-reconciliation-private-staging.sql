-- Private-staging proposal only. No production D1 mutation authorized.
-- This is a conservative reservation reconciliation ledger.
-- Only a separately reviewed settlement workflow may release unused reserve.
-- Do not use provider response text or client-provided costs as settlement proof.
CREATE TABLE IF NOT EXISTS ai_budget_reconciliation (
 tenant_id TEXT NOT NULL,
 period TEXT NOT NULL,
 request_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('completed','uncertain')),
 actual_micro_usd INTEGER CHECK(actual_micro_usd IS NULL OR actual_micro_usd >= 0),
 reconciled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,period,request_id),
 FOREIGN KEY(tenant_id,period,request_id)
 REFERENCES ai_budget_reservation(tenant_id,period,request_id),
 CHECK ((state='completed' AND actual_micro_usd IS NOT NULL)
     OR (state='uncertain' AND actual_micro_usd IS NULL))
);
-- No automatic decrement of reserved_micro_usd: unknown provider billing,
-- incomplete responses, and invoice lag must not free spending headroom.
-- Reconciliation reports cannot themselves grant additional quota.
