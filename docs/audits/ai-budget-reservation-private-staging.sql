-- PROPOSAL ONLY: isolated staging database; not applied to production.
-- Currency values are integer micro-USD. Reservations are conservative upper
-- bounds, not actual charges. Each request is unique per tenant and month.
CREATE TABLE IF NOT EXISTS ai_monthly_budget (
 tenant_id TEXT NOT NULL, period TEXT NOT NULL,
 limit_micro_usd INTEGER NOT NULL CHECK(limit_micro_usd>=0),
 reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micro_usd>=0),
 PRIMARY KEY(tenant_id,period),
 CHECK(reserved_micro_usd<=limit_micro_usd)
);
CREATE TABLE IF NOT EXISTS ai_budget_reservation (
 tenant_id TEXT NOT NULL, period TEXT NOT NULL, request_id TEXT NOT NULL,
 amount_micro_usd INTEGER NOT NULL CHECK(amount_micro_usd>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,period,request_id),
 FOREIGN KEY(tenant_id,period) REFERENCES ai_monthly_budget(tenant_id,period)
);
-- SQLite executes the insert and trigger in one atomic statement. Failed
-- budget increments abort the insert, preventing concurrent overspend.
CREATE TRIGGER IF NOT EXISTS ai_budget_reservation_guard
BEFORE INSERT ON ai_budget_reservation
BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM ai_monthly_budget WHERE tenant_id=NEW.tenant_id AND period=NEW.period
 ) THEN RAISE(ABORT,'ai_budget_missing') END;
 UPDATE ai_monthly_budget SET reserved_micro_usd=reserved_micro_usd+NEW.amount_micro_usd
 WHERE tenant_id=NEW.tenant_id AND period=NEW.period
   AND reserved_micro_usd<=limit_micro_usd-NEW.amount_micro_usd;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'ai_budget_exceeded') END;
END;
-- Never delete reservations automatically after an ambiguous provider failure.
-- Release/reconciliation requires separate verified billed-usage evidence.
