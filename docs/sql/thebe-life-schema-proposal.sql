-- THEBE LIFE: PostgreSQL design proposal only. DO NOT APPLY IN PRODUCTION.
-- Requires full migration, grants, RLS, authorization, backup and rollback reviews.
-- No policies granting access are included: default is fail closed.
CREATE SCHEMA IF NOT EXISTS thebe_life;
CREATE TABLE IF NOT EXISTS thebe_life.households (
 id uuid PRIMARY KEY,
 display_name text NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS thebe_life.household_members (
 household_id uuid NOT NULL REFERENCES thebe_life.households(id),
 user_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','adult','viewer')),
 status text NOT NULL CHECK (status IN ('invited','active','revoked')),
 PRIMARY KEY (household_id,user_id)
);
CREATE TABLE IF NOT EXISTS thebe_life.household_entries (
 household_id uuid NOT NULL REFERENCES thebe_life.households(id),
 id uuid NOT NULL,
 category text NOT NULL,
 type text NOT NULL CHECK (type IN ('income','expense','commitment','transfer_in','transfer_out')),
 amount_minor bigint NOT NULL CHECK(amount_minor >= 0),
 currency char(3) NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
 occurred_on date NOT NULL,
 transfer_id uuid,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (household_id,id),
 CHECK (type NOT IN ('transfer_in','transfer_out') OR transfer_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS thebe_life.motshelo_groups (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 model text NOT NULL CHECK(model IN ('rotating','annual','lending','grocery','burial','property','investment')),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS thebe_life.motshelo_members (
 group_id uuid NOT NULL REFERENCES thebe_life.motshelo_groups(id),
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('chair','treasurer','secretary','member','auditor')),
 status text NOT NULL CHECK(status IN ('invited','active','revoked')),
 PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS thebe_life.motshelo_contributions (
 group_id uuid NOT NULL REFERENCES thebe_life.motshelo_groups(id),
 id uuid NOT NULL,
 member_user_id uuid NOT NULL,
 due_on date NOT NULL,
 reported_minor bigint NOT NULL DEFAULT 0 CHECK(reported_minor >= 0),
 matched_minor bigint NOT NULL DEFAULT 0 CHECK(matched_minor >= 0),
 cleared_minor bigint NOT NULL DEFAULT 0 CHECK(cleared_minor >= 0),
 external_receipt_ref text,
 currency char(3) NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
 CHECK(cleared_minor <= matched_minor AND matched_minor <= reported_minor),
 FOREIGN KEY (group_id,member_user_id) REFERENCES thebe_life.motshelo_members(group_id,user_id),
 PRIMARY KEY(group_id,id)
);
CREATE TABLE IF NOT EXISTS thebe_life.insurance_partners (
 id uuid PRIMARY KEY,
 legal_name text NOT NULL,
 regulator_verification_status text NOT NULL DEFAULT 'pending' CHECK(regulator_verification_status IN ('pending','verified','expired','rejected')),
 contract_status text NOT NULL DEFAULT 'pending' CHECK(contract_status IN ('pending','approved','expired','terminated')),
 distribution_permission_status text NOT NULL DEFAULT 'pending' CHECK(distribution_permission_status IN ('pending','verified','expired','rejected'))
);
CREATE TABLE IF NOT EXISTS thebe_life.insurance_referrals (
 id uuid PRIMARY KEY,
 household_id uuid NOT NULL REFERENCES thebe_life.households(id),
 partner_id uuid NOT NULL REFERENCES thebe_life.insurance_partners(id),
 consent_record_ref text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','consented','submitted','withdrawn','declined')),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS enabled and forced, with NO permissive policies yet.
ALTER TABLE thebe_life.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.households FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.household_members FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.household_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.household_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_members FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.motshelo_contributions FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.insurance_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.insurance_partners FORCE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.insurance_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE thebe_life.insurance_referrals FORCE ROW LEVEL SECURITY;
-- Future migration must revoke PUBLIC schema/table access, assign low-privilege
-- app roles and implement server-resolved household/group membership policies.
