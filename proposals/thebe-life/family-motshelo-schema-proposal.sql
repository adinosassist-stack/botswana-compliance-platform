-- Thebe Life — PERSONAL and MOTSHELO schema PROPOSAL ONLY.
-- NOT A LIVE MIGRATION. DO NOT RUN against any Cloudflare or production database.
-- No banking account/wallet, stored-value, deposit-taking, payout execution,
-- interest calculation, debt enforcement, or lending tables are defined.
--
-- Separate auth/retention approvals and a new private isolated D1 are required
-- before adapting any of these tables into an actual migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS life_identities (
 id TEXT PRIMARY KEY,
 auth_subject TEXT NOT NULL UNIQUE,
 lifecycle_state TEXT NOT NULL DEFAULT 'active'
  CHECK (lifecycle_state IN ('active','suspended','deleted')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS life_households (
 id TEXT PRIMARY KEY,
 owner_identity_id TEXT NOT NULL REFERENCES life_identities(id),
 name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 currency TEXT NOT NULL DEFAULT 'BWP' CHECK (currency = 'BWP'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS life_household_members (
 household_id TEXT NOT NULL REFERENCES life_households(id) ON DELETE CASCADE,
 identity_id TEXT NOT NULL REFERENCES life_identities(id),
 role TEXT NOT NULL CHECK (role IN ('owner','adult_editor','viewer')),
 state TEXT NOT NULL DEFAULT 'invited' CHECK (state IN ('invited','accepted','revoked')),
 accepted_at TEXT,
 PRIMARY KEY (household_id,identity_id)
);
CREATE TABLE IF NOT EXISTS life_budget_envelopes (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES life_households(id) ON DELETE CASCADE,
 budget_month TEXT NOT NULL CHECK (length(budget_month)=7),
 name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 budget_thebe INTEGER NOT NULL CHECK (budget_thebe >= 0),
 UNIQUE (household_id,budget_month,name),
 UNIQUE (household_id,id)
);
CREATE TABLE IF NOT EXISTS life_budget_expenses (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL,
 envelope_id TEXT NOT NULL,
 amount_thebe INTEGER NOT NULL CHECK (amount_thebe >= 0),
 transaction_date TEXT NOT NULL,
 created_by_identity TEXT NOT NULL REFERENCES life_identities(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (household_id,envelope_id)
   REFERENCES life_budget_envelopes(household_id,id)
);
CREATE INDEX IF NOT EXISTS life_budget_expenses_scope
 ON life_budget_expenses(household_id,envelope_id,transaction_date);

CREATE TABLE IF NOT EXISTS life_motshelo_groups (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 mode TEXT NOT NULL DEFAULT 'rotating_recordkeeping'
   CHECK (mode = 'rotating_recordkeeping'),
 contribution_thebe INTEGER NOT NULL CHECK (contribution_thebe > 0),
 currency TEXT NOT NULL DEFAULT 'BWP' CHECK (currency = 'BWP'),
 rules_version INTEGER NOT NULL DEFAULT 1 CHECK (rules_version > 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS life_motshelo_members (
 group_id TEXT NOT NULL REFERENCES life_motshelo_groups(id) ON DELETE CASCADE,
 identity_id TEXT NOT NULL REFERENCES life_identities(id),
 role TEXT NOT NULL CHECK (role IN ('chair','treasurer','member','auditor')),
 status TEXT NOT NULL DEFAULT 'invited'
  CHECK (status IN ('invited','active','suspended','left')),
 joined_at TEXT,
 PRIMARY KEY(group_id,identity_id)
);
CREATE TABLE IF NOT EXISTS life_motshelo_rounds (
 id TEXT PRIMARY KEY,
 group_id TEXT NOT NULL REFERENCES life_motshelo_groups(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
 due_month TEXT NOT NULL CHECK (length(due_month)=7),
 recipient_identity_id TEXT NOT NULL,
 expected_total_thebe INTEGER NOT NULL CHECK (expected_total_thebe > 0),
 state TEXT NOT NULL DEFAULT 'planned'
  CHECK (state IN ('planned','under_review','external_paid_recorded','cancelled')),
 UNIQUE (group_id,ordinal),
 UNIQUE (group_id,id),
 FOREIGN KEY (group_id,recipient_identity_id)
  REFERENCES life_motshelo_members(group_id,identity_id)
);
CREATE TABLE IF NOT EXISTS life_motshelo_contribution_proofs (
 id TEXT PRIMARY KEY,
 group_id TEXT NOT NULL,
 round_id TEXT NOT NULL,
 contributor_identity_id TEXT NOT NULL,
 amount_thebe INTEGER NOT NULL CHECK(amount_thebe > 0),
 -- Digest of reviewed, external payment receipt reference. Never raw payment
 -- credentials, PII or free-text bank details.
 external_receipt_digest TEXT NOT NULL CHECK (length(external_receipt_digest)=64),
 recorded_by_identity_id TEXT NOT NULL REFERENCES life_identities(id),
 verified_by_identity_id TEXT REFERENCES life_identities(id),
 status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','verified_external','rejected')),
 verified_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (group_id,external_receipt_digest),
 UNIQUE (group_id,round_id,contributor_identity_id),
 FOREIGN KEY (group_id,round_id) REFERENCES life_motshelo_rounds(group_id,id),
 FOREIGN KEY (group_id,contributor_identity_id)
  REFERENCES life_motshelo_members(group_id,identity_id),
 CHECK (verified_by_identity_id IS NULL OR verified_by_identity_id <> recorded_by_identity_id),
 CHECK ((status='verified_external' AND verified_by_identity_id IS NOT NULL AND verified_at IS NOT NULL)
    OR status<>'verified_external')
);
CREATE TABLE IF NOT EXISTS life_motshelo_review_approvals (
 group_id TEXT NOT NULL,
 round_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('chair','treasurer')),
 approved_by_identity_id TEXT NOT NULL,
 approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 approval_event_hash TEXT NOT NULL CHECK (length(approval_event_hash)=64),
 PRIMARY KEY(group_id,round_id,role),
 FOREIGN KEY (group_id,round_id) REFERENCES life_motshelo_rounds(group_id,id),
 FOREIGN KEY (group_id,approved_by_identity_id)
  REFERENCES life_motshelo_members(group_id,identity_id)
);
CREATE TABLE IF NOT EXISTS life_motshelo_audit_events (
 id TEXT PRIMARY KEY,
 group_id TEXT NOT NULL REFERENCES life_motshelo_groups(id) ON DELETE CASCADE,
 actor_identity_id TEXT NOT NULL REFERENCES life_identities(id),
 action TEXT NOT NULL CHECK (action IN ('join','leave','contribution_recorded','contribution_verified','contribution_rejected','review_approved','external_payout_recorded','round_cancelled')),
 event_digest TEXT NOT NULL CHECK (length(event_digest)=64),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS life_motshelo_audit_scope
 ON life_motshelo_audit_events(group_id,created_at);

-- Notes for future migration review:
-- 1. Require server-authenticated group/household scopes on EVERY access.
-- 2. Only permit approval by an active member with the matching officer role;
--    require distinct chair and treasurer identity IDs (transaction-level guard).
-- 3. Prevent audited records being modified/deleted after acceptance, except
--    explicit reversal events. Enforce idempotency at write-transaction boundary.
-- 4. No external payment transfers. No stored value, bank credentials, deposits,
--    lending or automatic disbursement, even when all review rows exist.
-- 5. Define retention, deletion/export, family consent and group dispute policy
--    before deploying to a segregated staging database.
