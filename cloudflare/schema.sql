PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  session_generation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS memberships(
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
  status TEXT NOT NULL DEFAULT 'active',
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id,status);

CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  public_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  session_generation INTEGER NOT NULL DEFAULT 0,
  csrf_token TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id,expires_at);


CREATE TABLE IF NOT EXISTS password_reset_tokens(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id,expires_at);

CREATE TABLE IF NOT EXISTS app_state(
  tenant_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  object_key TEXT,
  display_name TEXT,
  category TEXT,
  content_type TEXT,
  expected_size INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  legal_hold INTEGER NOT NULL DEFAULT 0,
  retention_until TEXT,
  deleted_at TEXT,
  storage_deleted_at TEXT,
  deletion_status TEXT,
  deletion_attempts INTEGER NOT NULL DEFAULT 0,
  deletion_error TEXT,
  content_sha256 TEXT,
  review_status TEXT NOT NULL DEFAULT 'quarantined' CHECK(review_status IN ('quarantined','approved','rejected')),
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  duplicate_of_evidence_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_tenant_status_idx ON evidence(tenant_id,upload_status,scan_status);
CREATE INDEX IF NOT EXISTS evidence_retention_idx ON evidence(deleted_at,legal_hold,retention_until);

CREATE TABLE IF NOT EXISTS audit_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_tenant_time_idx ON audit_events(tenant_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS external_identities(
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider,provider_user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS external_identity_user_idx ON external_identities(user_id);

CREATE TABLE IF NOT EXISTS subscriptions(
  tenant_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'business',
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT,
  current_period_ends_at TEXT,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legal_holds(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS legal_hold_tenant_idx ON legal_holds(tenant_id,active);

CREATE TABLE IF NOT EXISTS deletion_requests(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  requested_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','blocked','processing','completed','failed','canceled')),
  reason TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  approved_at TEXT,
  completed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processing_token TEXT,
  processing_started_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS deletion_tenant_idx ON deletion_requests(tenant_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS deletion_processing_recovery_idx ON deletion_requests(status,processing_started_at,requested_at);


CREATE TABLE IF NOT EXISTS tender_items(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  closing_at TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'watching',
  requirements_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tender_items_tenant_close_idx ON tender_items(tenant_id,closing_at,status);

CREATE TABLE IF NOT EXISTS employees(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_title TEXT,
  employment_type TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employees_tenant_status_idx ON employees(tenant_id,status);

CREATE TABLE IF NOT EXISTS company_actions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  due_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_actions_tenant_due_idx ON company_actions(tenant_id,due_at,status);


CREATE TABLE IF NOT EXISTS licences(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  licence_type TEXT NOT NULL,
  authority TEXT,
  issued_at TEXT,
  renewal_due_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS licences_tenant_due_idx ON licences(tenant_id,renewal_due_at,status);

CREATE TABLE IF NOT EXISTS partner_clients(
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'advisor',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(partner_tenant_id,client_tenant_id)
);
CREATE INDEX IF NOT EXISTS partner_clients_partner_idx ON partner_clients(partner_tenant_id,status);

CREATE TABLE IF NOT EXISTS workflow_jobs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  due_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workflow_jobs_due_idx ON workflow_jobs(status,due_at);

CREATE TABLE IF NOT EXISTS ai_usage(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ai_usage_tenant_time_idx ON ai_usage(tenant_id,occurred_at DESC);


CREATE TABLE IF NOT EXISTS ai_credit_wallets(
  tenant_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  monthly_reset_at TEXT,
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,
  lifetime_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_credit_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('grant','purchase','usage','refund','adjustment')),
  credits INTEGER NOT NULL,
  feature TEXT,
  reference_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_credit_ledger_tenant_time_idx ON ai_credit_ledger(tenant_id,occurred_at DESC);


CREATE TABLE IF NOT EXISTS ai_credit_grants(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  grant_key TEXT NOT NULL,
  credits INTEGER NOT NULL,
  grant_type TEXT NOT NULL CHECK(grant_type IN ('monthly','promo','partner_pool')),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,grant_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_credit_grants_tenant_idx ON ai_credit_grants(tenant_id,granted_at DESC);

CREATE TABLE IF NOT EXISTS ai_credit_packs(
  sku TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  price_bwp INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ai_credit_packs(sku,credits,price_bwp,sort_order) VALUES
  ('AI50',50,59,10),
  ('AI150',150,149,20),
  ('AI500',500,399,30);

CREATE TABLE IF NOT EXISTS ai_credit_orders(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_bwp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded','canceled')),
  provider TEXT,
  provider_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  refunded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_credit_orders_tenant_time_idx ON ai_credit_orders(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS partner_credit_pools(
  partner_tenant_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(partner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_credit_allocations(
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  monthly_cap INTEGER NOT NULL DEFAULT 0,
  used_this_month INTEGER NOT NULL DEFAULT 0,
  month_key TEXT NOT NULL,
  PRIMARY KEY(partner_tenant_id,client_tenant_id),
  FOREIGN KEY(partner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(client_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS ai_cost_controls(
  tenant_id TEXT PRIMARY KEY,
  monthly_credit_cap INTEGER,
  monthly_cost_cap_bwp REAL,
  low_balance_threshold INTEGER NOT NULL DEFAULT 25,
  hard_stop INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_provider_costs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT,
  provider_units REAL NOT NULL DEFAULT 0,
  provider_cost_bwp REAL NOT NULL DEFAULT 0,
  reference_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_provider_costs_tenant_time_idx ON ai_provider_costs(tenant_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS ai_credit_adjustments(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('refund','manual_credit','manual_debit','promo')),
  credits INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_credit_adjustments_tenant_idx ON ai_credit_adjustments(tenant_id,created_at DESC);

-- v78: data-minimised metadata for read-only Business Protection Copilot runs.
-- User questions and generated answers are intentionally never persisted.
CREATE TABLE IF NOT EXISTS ai_advisor_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL
    CHECK(mode IN ('ask','next_actions','explain_risk','management_brief','tender_readiness')),
  status TEXT NOT NULL
    CHECK(status IN ('completed','fallback','failed')),
  generation_mode TEXT NOT NULL
    CHECK(generation_mode IN ('workers_ai','structured_fallback')),
  model TEXT,
  context_counts_json TEXT NOT NULL DEFAULT '{}',
  source_count INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  output_hash TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_advisor_runs_tenant_time_idx
ON ai_advisor_runs(tenant_id,created_at DESC);


CREATE TABLE IF NOT EXISTS tender_requirements(
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  label TEXT NOT NULL,
  mandatory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','ready','review','not_applicable')),
  evidence_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tender_id) REFERENCES tender_items(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tender_requirements_tender_idx ON tender_requirements(tender_id,status);

CREATE TABLE IF NOT EXISTS tender_reviews(
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','approved','rejected')),
  reviewer_user_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY(tender_id) REFERENCES tender_items(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tender_reviews_tenant_idx ON tender_reviews(tenant_id,status);

CREATE TABLE IF NOT EXISTS hr_cases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT,
  case_type TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','evidence','review','approved','closed','blocked')),
  summary TEXT,
  decision TEXT,
  professional_review_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS hr_cases_tenant_status_idx ON hr_cases(tenant_id,status,risk_level);

CREATE TABLE IF NOT EXISTS hr_case_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hr_case_events_case_idx ON hr_case_events(case_id,occurred_at DESC);


CREATE TABLE IF NOT EXISTS company_action_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(action_id) REFERENCES company_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_action_events_action_idx ON company_action_events(action_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS licence_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(licence_id) REFERENCES licences(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS licence_events_licence_idx ON licence_events(licence_id,occurred_at DESC);


CREATE TABLE IF NOT EXISTS passport_shares(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  share_token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  scopes_json TEXT NOT NULL DEFAULT '["controls"]',
  selected_controls_json TEXT NOT NULL DEFAULT '[]',
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_shares_tenant_idx ON passport_shares(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS passport_verifications(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('unverified','verified','expired','review')),
  evidence_id TEXT,
  verified_at TEXT,
  expires_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(tenant_id,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_verifications_tenant_status_idx ON passport_verifications(tenant_id,status);

CREATE TABLE IF NOT EXISTS partner_tasks(
  id TEXT PRIMARY KEY,
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','review','done','blocked')),
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS partner_tasks_partner_idx ON partner_tasks(partner_tenant_id,status,priority,due_at);

CREATE TABLE IF NOT EXISTS workflow_rules(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workflow_rules_tenant_idx ON workflow_rules(tenant_id,enabled);


CREATE TABLE IF NOT EXISTS notification_outbox(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'user',
  recipient_ref TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('in_app','email','whatsapp','sms')),
  template_key TEXT NOT NULL,
  subject TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed','canceled')),
  scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status,scheduled_at);

CREATE TABLE IF NOT EXISTS compliance_schedules(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly','annual')),
  config_json TEXT NOT NULL DEFAULT '{}',
  next_run_at TEXT,
  last_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS compliance_schedules_due_idx ON compliance_schedules(enabled,next_run_at);

CREATE TABLE IF NOT EXISTS partner_invites(
  id TEXT PRIMARY KEY,
  partner_tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client_owner',
  invite_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','expired','revoked')),
  expires_at TEXT NOT NULL,
  accepted_client_tenant_id TEXT,
  scopes_json TEXT NOT NULL DEFAULT '["read"]',
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS partner_invites_partner_idx ON partner_invites(partner_tenant_id,status,expires_at);

CREATE TABLE IF NOT EXISTS notification_preferences(
  user_id TEXT PRIMARY KEY,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS service_catalog(
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  base_price_bwp INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  requires_professional INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO service_catalog(sku,name,category,description,base_price_bwp,sort_order) VALUES
 ('TENDER_REVIEW','Tender Review','tender','Human review of tender readiness and submission risks.',750,10),
 ('TENDER_PACK','Assisted Tender Pack','tender','Assisted assembly and submission-readiness check.',1800,20),
 ('HR_CASE_REVIEW','HR Case Review','employment','Professional review of a high-risk HR case.',1250,30),
 ('COMPANY_CHANGE','Company Change Assistance','company','Assisted CIPA/company-secretary change workflow.',650,40),
 ('COMPLIANCE_AUDIT','SME Compliance Audit','compliance','Structured review across corporate, tax, labour, licensing and evidence.',2500,50),
 ('LICENCE_ASSIST','Licence Assistance','licensing','Assisted licence application or renewal preparation.',950,60),
 ('ASSISTED_SETUP','Assisted Workspace Setup','onboarding','Guided configuration, evidence checklist and first compliance profile review.',499,70);

CREATE TABLE IF NOT EXISTS service_orders(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_payment','paid','assigned','in_review','completed','canceled','refunded')),
  price_bwp INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BWP',
  professional_user_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS service_orders_tenant_idx ON service_orders(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS service_order_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES service_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS service_order_events_order_idx ON service_order_events(order_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS professional_profiles(
  user_id TEXT PRIMARY KEY,
  professional_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','suspended')),
  service_categories_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS payment_customers(
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,provider_customer_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_orders(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK(order_type IN ('subscription','ai_credits','service')),
  reference_id TEXT,
  provider TEXT,
  provider_checkout_id TEXT,
  provider_payment_id TEXT,
  amount_bwp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','failed','canceled','refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  refunded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_orders_tenant_idx ON payment_orders(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_provider_idx ON payment_orders(provider,provider_payment_id);

CREATE TABLE IF NOT EXISTS payment_events(
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payment_order_id TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  processing_token TEXT,
  processing_started_at TEXT,
  processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK(processing_attempts BETWEEN 0 AND 100),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_events_recovery_idx ON payment_events(processed,event_type,processing_started_at,received_at);

CREATE TABLE IF NOT EXISTS payment_failures(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  payment_order_id TEXT NOT NULL,
  reason_code TEXT,
  message TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS payment_provider_sessions(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_token TEXT,
  checkout_url TEXT,
  provider_status TEXT,
  expires_at TEXT,
  raw_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_provider_sessions_tenant_idx
ON payment_provider_sessions(tenant_id,provider,created_at DESC);


CREATE TABLE IF NOT EXISTS payment_provider_accounts(
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  merchant_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK(merchant_status IN ('not_configured','application_required','testing','live','suspended')),
  display_name TEXT,
  settlement_currency TEXT NOT NULL DEFAULT 'BWP',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  config_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,provider),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_reconciliation(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  internal_status TEXT NOT NULL,
  provider_status TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(reconciliation_status IN ('pending','matched','mismatch','manual_review','closed')),
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_reconciliation_tenant_idx
ON payment_reconciliation(tenant_id,reconciliation_status,checked_at DESC);

CREATE TABLE IF NOT EXISTS payment_return_events(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT,
  tenant_id TEXT,
  provider TEXT NOT NULL,
  return_type TEXT NOT NULL CHECK(return_type IN ('success','cancel','unknown')),
  query_json TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payment_return_events_order_idx
ON payment_return_events(payment_order_id,received_at DESC);


CREATE TABLE IF NOT EXISTS plan_entitlements(
  plan TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  limit_value INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(plan,feature_key)
);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','core_compliance',1,NULL),
 ('starter','tenderready',0,NULL),
 ('starter','employer_shield',0,NULL),
 ('starter','company_secretary',0,NULL),
 ('starter','licenceos',1,10),
 ('starter','compliance_passport',1,NULL),
 ('starter','partner_portal',0,0),
 ('starter','professional_services',1,NULL),
 ('starter','ai_monthly_credits',1,0),

 ('business','core_compliance',1,NULL),
 ('business','tenderready',1,25),
 ('business','employer_shield',1,50),
 ('business','company_secretary',1,NULL),
 ('business','licenceos',1,50),
 ('business','compliance_passport',1,NULL),
 ('business','partner_portal',0,0),
 ('business','professional_services',1,NULL),
 ('business','ai_monthly_credits',1,40),

 ('pro','core_compliance',1,NULL),
 ('pro','tenderready',1,100),
 ('pro','employer_shield',1,250),
 ('pro','company_secretary',1,NULL),
 ('pro','licenceos',1,250),
 ('pro','compliance_passport',1,NULL),
 ('pro','partner_portal',0,0),
 ('pro','professional_services',1,NULL),
 ('pro','ai_monthly_credits',1,150),

 ('partner','core_compliance',1,NULL),
 ('partner','tenderready',1,500),
 ('partner','employer_shield',1,1000),
 ('partner','company_secretary',1,NULL),
 ('partner','licenceos',1,1000),
 ('partner','compliance_passport',1,NULL),
 ('partner','partner_portal',1,20),
 ('partner','professional_services',1,NULL),
 ('partner','ai_monthly_credits',1,500),

 ('starter','daily_operations',0,0),('starter','operating_locations',1,1),('starter','bw_tax_transition',1,NULL),('starter','cipa_survival',1,NULL),('starter','procurement_transition',1,NULL),
 ('business','daily_operations',1,1),('business','operating_locations',1,2),('business','bw_tax_transition',1,NULL),('business','cipa_survival',1,NULL),('business','procurement_transition',1,NULL),
 ('pro','daily_operations',1,1),('pro','operating_locations',1,10),('pro','bw_tax_transition',1,NULL),('pro','cipa_survival',1,NULL),('pro','procurement_transition',1,NULL),
 ('network','core_compliance',1,NULL),('network','tenderready',1,500),('network','employer_shield',1,500),('network','company_secretary',1,NULL),('network','licenceos',1,1000),('network','compliance_passport',1,NULL),('network','partner_portal',1,5),('network','professional_services',1,NULL),('network','ai_monthly_credits',1,350),('network','daily_operations',1,1),('network','operating_locations',1,25),('network','bw_tax_transition',1,NULL),('network','cipa_survival',1,NULL),('network','procurement_transition',1,NULL),
 ('partner','daily_operations',1,1),('partner','operating_locations',1,100),('partner','bw_tax_transition',1,NULL),('partner','cipa_survival',1,NULL),('partner','procurement_transition',1,NULL);

CREATE TABLE IF NOT EXISTS tenant_usage_counters(
  tenant_id TEXT NOT NULL,
  counter_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,counter_key,period_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entitlement_overrides(
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER,
  limit_value INTEGER,
  expires_at TEXT,
  reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,feature_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS regulatory_sources(
  id TEXT PRIMARY KEY,
  jurisdiction TEXT NOT NULL DEFAULT 'BW',
  authority TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'official',
  publication_date TEXT,
  effective_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','superseded','conflict')),
  checksum TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS regulatory_sources_status_idx
ON regulatory_sources(status,effective_date DESC,publication_date DESC);

CREATE TABLE IF NOT EXISTS regulatory_rules(
  id TEXT PRIMARY KEY,
  rule_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  applicability_json TEXT NOT NULL DEFAULT '{}',
  action_json TEXT NOT NULL DEFAULT '{}',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  effective_from TEXT,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','review','approved','published','retired','blocked')),
  confidence TEXT NOT NULL DEFAULT 'medium'
    CHECK(confidence IN ('low','medium','high')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(rule_key,version)
);
CREATE INDEX IF NOT EXISTS regulatory_rules_status_idx
ON regulatory_rules(status,effective_from DESC);

CREATE TABLE IF NOT EXISTS regulatory_rule_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS regulatory_rule_events_rule_idx
ON regulatory_rule_events(rule_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS regulatory_conflicts(
  id TEXT PRIMARY KEY,
  topic_key TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','resolved','dismissed')),
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS regulatory_conflicts_status_idx
ON regulatory_conflicts(status,created_at DESC);

CREATE TABLE IF NOT EXISTS regulatory_impacts(
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  impact_level TEXT NOT NULL DEFAULT 'review'
    CHECK(impact_level IN ('info','review','action','urgent')),
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','reviewed','actioned','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS regulatory_impacts_tenant_idx
ON regulatory_impacts(tenant_id,status,impact_level,created_at DESC);


CREATE TABLE IF NOT EXISTS company_rule_applicability(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  applicability_status TEXT NOT NULL DEFAULT 'review'
    CHECK(applicability_status IN ('applies','does_not_apply','review','unknown')),
  basis_json TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evaluated_by TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,rule_id)
);
CREATE INDEX IF NOT EXISTS company_rule_applicability_tenant_idx
ON company_rule_applicability(tenant_id,applicability_status,evaluated_at DESC);

CREATE TABLE IF NOT EXISTS compliance_obligations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  obligation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','review','completed','not_applicable','blocked')),
  priority INTEGER NOT NULL DEFAULT 2,
  evidence_required INTEGER NOT NULL DEFAULT 0,
  assigned_user_id TEXT,
  assigned_at TEXT,
  started_at TEXT,
  review_requested_at TEXT,
  completed_at TEXT,
  completed_by_user_id TEXT,
  completion_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,rule_id,obligation_key)
);
CREATE INDEX IF NOT EXISTS compliance_obligations_tenant_idx
ON compliance_obligations(tenant_id,status,priority,due_at);
CREATE INDEX IF NOT EXISTS compliance_obligations_assignment_idx
ON compliance_obligations(tenant_id,assigned_user_id,status,due_at);

CREATE TABLE IF NOT EXISTS obligation_evidence_requirements(
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  evidence_type TEXT,
  mandatory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK(status IN ('missing','attached','verified','not_applicable')),
  evidence_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(obligation_id) REFERENCES compliance_obligations(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS obligation_evidence_idx
ON obligation_evidence_requirements(obligation_id,status);

CREATE TABLE IF NOT EXISTS regulatory_rollout_runs(
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed')),
  tenants_evaluated INTEGER NOT NULL DEFAULT 0,
  obligations_created INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS obligation_escalations(
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  escalation_level TEXT NOT NULL DEFAULT 'reminder'
    CHECK(escalation_level IN ('reminder','warning','urgent','professional_review')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','acknowledged','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  acknowledged_by_user_id TEXT,
  acknowledgement_note TEXT,
  response_due_at TEXT,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  resolution_note TEXT,
  resolution_basis TEXT,
  FOREIGN KEY(obligation_id) REFERENCES compliance_obligations(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS obligation_escalations_tenant_idx
ON obligation_escalations(tenant_id,status,escalation_level,created_at DESC);
CREATE INDEX IF NOT EXISTS obligation_escalations_response_idx
ON obligation_escalations(tenant_id,status,response_due_at,escalation_level);

CREATE TABLE IF NOT EXISTS obligation_reminder_state(
  obligation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  last_reminder_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_escalation_level TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(obligation_id) REFERENCES compliance_obligations(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inspection_packs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK(status IN ('ready','stale','archived')),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS inspection_packs_tenant_idx
ON inspection_packs(tenant_id,generated_at DESC);

CREATE TABLE IF NOT EXISTS evidence_links(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  obligation_id TEXT,
  evidence_id TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'supporting'
    CHECK(link_type IN ('supporting','primary','supplementary')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(obligation_id) REFERENCES compliance_obligations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_links_obligation_idx
ON evidence_links(obligation_id,created_at DESC);


CREATE TABLE IF NOT EXISTS notification_delivery_attempts(
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('sent','failed','deferred')),
  error_code TEXT,
  error_message TEXT,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(notification_id) REFERENCES notification_outbox(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_delivery_attempts_notification_idx
ON notification_delivery_attempts(notification_id,attempt_no);

CREATE TABLE IF NOT EXISTS notification_dead_letters(
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(notification_id) REFERENCES notification_outbox(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_dead_letters_tenant_idx
ON notification_dead_letters(tenant_id,resolved_at,created_at DESC);

CREATE TABLE IF NOT EXISTS inspection_pack_exports(
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  export_format TEXT NOT NULL DEFAULT 'json'
    CHECK(export_format IN ('json','csv')),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK(status IN ('ready','expired','revoked')),
  export_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pack_id) REFERENCES inspection_packs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS inspection_pack_exports_tenant_idx
ON inspection_pack_exports(tenant_id,created_at DESC);


CREATE TABLE IF NOT EXISTS partner_client_access(
  id TEXT PRIMARY KEY,
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','active','revoked','expired')),
  scopes_json TEXT NOT NULL DEFAULT '["read"]',
  consented_by_user_id TEXT,
  consented_at TEXT,
  revoked_by_user_id TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_tenant_id,client_tenant_id),
  FOREIGN KEY(partner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(client_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_client_access_partner_idx
ON partner_client_access(partner_tenant_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_access_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS partner_access_events_pair_idx
ON partner_access_events(partner_tenant_id,client_tenant_id,occurred_at DESC);



CREATE TABLE IF NOT EXISTS passport_share_access_log(
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  result TEXT NOT NULL
    CHECK(result IN ('ok','expired','revoked','not_found','rate_limited')),
  accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(share_id) REFERENCES passport_shares(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_share_access_idx
ON passport_share_access_log(share_id,accessed_at DESC);



CREATE TABLE IF NOT EXISTS evidence_review_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT,
  actor_user_id TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_review_events_evidence_idx
ON evidence_review_events(evidence_id,occurred_at DESC);



CREATE TABLE IF NOT EXISTS employee_risk_controls(
  employee_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contract_signed INTEGER NOT NULL DEFAULT 0,
  contract_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK(contract_type IN ('permanent','fixed_term','casual','temporary','unknown')),
  fixed_term_end_date TEXT,
  fixed_term_justification_recorded INTEGER NOT NULL DEFAULT 0,
  probation_end_date TEXT,
  probation_review_recorded INTEGER NOT NULL DEFAULT 0,
  leave_record_current INTEGER NOT NULL DEFAULT 0,
  attendance_record_current INTEGER NOT NULL DEFAULT 0,
  overtime_control INTEGER NOT NULL DEFAULT 0,
  asset_acknowledgement INTEGER NOT NULL DEFAULT 0,
  disciplinary_process_open INTEGER NOT NULL DEFAULT 0,
  grievance_open INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  last_reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employee_risk_controls_tenant_idx
ON employee_risk_controls(tenant_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS employment_risk_findings(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT,
  finding_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,employee_id,finding_key)
);
CREATE INDEX IF NOT EXISTS employment_risk_findings_tenant_idx
ON employment_risk_findings(tenant_id,status,severity,updated_at DESC);

CREATE TABLE IF NOT EXISTS employment_risk_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  protection_score INTEGER NOT NULL,
  risk_band TEXT NOT NULL CHECK(risk_band IN ('low','moderate','high','critical')),
  active_employees INTEGER NOT NULL DEFAULT 0,
  open_findings INTEGER NOT NULL DEFAULT 0,
  high_critical_findings INTEGER NOT NULL DEFAULT 0,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employment_risk_snapshots_tenant_idx
ON employment_risk_snapshots(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS business_protection_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT NOT NULL,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  drivers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_protection_snapshots_tenant_idx
ON business_protection_snapshots(tenant_id,created_at DESC);


CREATE TABLE IF NOT EXISTS business_risk_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK(category IN ('employment','regulatory','evidence','licence','tender','corporate')),
  severity TEXT NOT NULL
    CHECK(severity IN ('low','medium','high','critical')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,event_key)
);
CREATE INDEX IF NOT EXISTS business_risk_events_tenant_idx
ON business_risk_events(tenant_id,status,severity,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS business_risk_event_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('detected','worsened','improved','acknowledged','resolved','reopened','dismissed')),
  severity_from TEXT,
  severity_to TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(risk_event_id) REFERENCES business_risk_events(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_risk_event_history_idx
ON business_risk_event_history(tenant_id,risk_event_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS business_risk_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  open_events INTEGER NOT NULL DEFAULT 0,
  critical_events INTEGER NOT NULL DEFAULT 0,
  high_events INTEGER NOT NULL DEFAULT 0,
  risk_pressure INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_risk_snapshots_tenant_idx
ON business_risk_snapshots(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS risk_engine_state(
  state_key TEXT PRIMARY KEY,
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS industry_protection_packs(
  pack_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft','review','published','retired')),
  sector_aliases_json TEXT NOT NULL DEFAULT '[]',
  controls_json TEXT NOT NULL DEFAULT '[]',
  rule_keys_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_industry_pack_assignments(
  tenant_id TEXT NOT NULL,
  pack_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recommended'
    CHECK(status IN ('recommended','active','dismissed')),
  match_confidence INTEGER NOT NULL DEFAULT 0,
  match_basis_json TEXT NOT NULL DEFAULT '{}',
  activated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,pack_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(pack_key) REFERENCES industry_protection_packs(pack_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenant_industry_pack_assignments_idx
ON tenant_industry_pack_assignments(tenant_id,status,match_confidence DESC);

CREATE TABLE IF NOT EXISTS industry_control_status(
  tenant_id TEXT NOT NULL,
  pack_key TEXT NOT NULL,
  control_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK(status IN ('not_started','in_progress','ready','review','not_applicable')),
  evidence_hint TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,pack_key,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(pack_key) REFERENCES industry_protection_packs(pack_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS industry_control_status_idx
ON industry_control_status(tenant_id,pack_key,status);

CREATE TABLE IF NOT EXISTS industry_benchmark_preferences(
  tenant_id TEXT PRIMARY KEY,
  opt_in INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS industry_benchmark_snapshots(
  id TEXT PRIMARY KEY,
  industry_key TEXT NOT NULL,
  cohort_size INTEGER NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS industry_benchmark_snapshots_idx
ON industry_benchmark_snapshots(industry_key,created_at DESC);

INSERT OR IGNORE INTO industry_protection_packs(pack_key,name,description,version,status,sector_aliases_json,controls_json,rule_keys_json) VALUES
('construction','Construction Protection Pack','Operational protection controls for construction and building businesses. Controls do not create legal obligations unless mapped to approved published regulatory rules.',1,'published',
 '["construction","building","contractor","renovation","interiors","aluminium","aluminum"]',
 '[{"key":"workforce_records","title":"Workforce records","description":"Maintain current worker engagement, attendance and employment-control records.","evidenceHint":"contracts, attendance, role or engagement records"},{"key":"site_documentation","title":"Site documentation","description":"Maintain project/site records, approvals and responsibility records relevant to the company workflow.","evidenceHint":"project files, approvals, job cards"},{"key":"licence_register","title":"Licence and permit register","description":"Maintain a current register of business, activity and site-related licences or permits that are confirmed applicable.","evidenceHint":"approved licence or permit records"},{"key":"tender_evidence","title":"Tender evidence readiness","description":"Keep reusable company evidence current for tender and corporate-customer requirements.","evidenceHint":"company profile, tax/licence evidence, capability records"},{"key":"incident_evidence","title":"Incident evidence trail","description":"Maintain a controlled evidence trail for material workplace or project incidents.","evidenceHint":"incident records, notices, photos, review notes"}]','[]'),
('hospitality','Hospitality Protection Pack','Operational protection controls for guest accommodation and hospitality businesses. Legal obligations remain source-gated.',1,'published',
 '["hospitality","hotel","guest house","guesthouse","lodging","rooms","accommodation"]',
 '[{"key":"guest_data","title":"Guest data controls","description":"Maintain controlled handling of guest personal information and access.","evidenceHint":"privacy notices, access records, retention controls"},{"key":"premises_controls","title":"Premises readiness","description":"Maintain current premises-related compliance and inspection records confirmed applicable to the business.","evidenceHint":"inspection records, licences, maintenance logs"},{"key":"workforce_records","title":"Workforce records","description":"Keep employment and scheduling evidence current for staff.","evidenceHint":"contracts, leave, attendance records"},{"key":"service_incidents","title":"Guest incident evidence","description":"Maintain a controlled record of material guest or premises incidents.","evidenceHint":"incident log, communications, corrective action"},{"key":"licence_register","title":"Licence register","description":"Track applicable operating licences and renewal dates.","evidenceHint":"approved licence records"}]','[]'),
('food_service','Food Service Protection Pack','Operational protection controls for cafes, restaurants and food-service businesses. Legal obligations remain source-gated.',1,'published',
 '["food","restaurant","cafe","coffee","coffee house","catering","bakery","takeaway"]',
 '[{"key":"premises_controls","title":"Premises and inspection readiness","description":"Maintain current premises and inspection evidence confirmed applicable to the operation.","evidenceHint":"inspection records, approvals, cleaning logs"},{"key":"supplier_traceability","title":"Supplier traceability","description":"Keep supplier and product-source records for material food inputs.","evidenceHint":"supplier invoices, batch or delivery records"},{"key":"workforce_records","title":"Workforce records","description":"Maintain staff contracts, attendance and role records.","evidenceHint":"contracts, attendance, training records"},{"key":"incident_evidence","title":"Product or customer incident evidence","description":"Preserve a controlled record of material product or customer incidents and corrective action.","evidenceHint":"incident log, corrective action, communications"},{"key":"licence_register","title":"Licence register","description":"Track applicable operating licences and renewal dates.","evidenceHint":"approved licence records"}]','[]'),
('manufacturing','Manufacturing Protection Pack','Operational protection controls for manufacturing businesses, with source-gated legal obligations.',1,'published',
 '["manufacturing","factory","fabrication","production","stone manufacturing","tombstone"]',
 '[{"key":"industrial_licence","title":"Industrial licence controls","description":"Track industrial/activity licences confirmed applicable and their renewal evidence.","evidenceHint":"approved industrial licence records"},{"key":"factory_records","title":"Factory or production-site records","description":"Maintain production-site approvals, inspection and responsibility records where applicable.","evidenceHint":"site approvals, inspection records, registers"},{"key":"workforce_records","title":"Workforce controls","description":"Maintain employment, attendance, overtime and role records.","evidenceHint":"contracts, attendance, overtime approvals"},{"key":"production_traceability","title":"Production traceability","description":"Retain sufficient job/batch/source records to investigate quality or customer disputes.","evidenceHint":"job cards, batch records, supplier records"},{"key":"incident_evidence","title":"Incident and corrective-action evidence","description":"Maintain controlled incident and corrective-action records.","evidenceHint":"incident logs, photos, corrective actions"}]','[]'),
('retail','Retail Protection Pack','Operational protection controls for retail and trading businesses. Legal obligations remain source-gated.',1,'published',
 '["retail","shop","store","trading","wholesale"]',
 '[{"key":"trade_licence","title":"Trade licence register","description":"Track applicable trade licences and anniversary/renewal evidence.","evidenceHint":"approved trade licence records"},{"key":"premises_controls","title":"Premises records","description":"Maintain current premises-related records confirmed applicable to the business.","evidenceHint":"lease, approvals, inspection records"},{"key":"workforce_records","title":"Workforce records","description":"Maintain current employee contracts, leave and attendance records.","evidenceHint":"contracts, leave and attendance records"},{"key":"customer_incidents","title":"Customer dispute evidence","description":"Keep controlled records for material customer complaints, refunds or disputes.","evidenceHint":"complaint records, communications, resolution"},{"key":"data_controls","title":"Customer-data controls","description":"Maintain controlled handling of customer personal information where collected.","evidenceHint":"privacy notice, access and retention records"}]','[]'),
('transport','Transport Protection Pack','Operational protection controls for transport and fleet businesses. Legal obligations remain source-gated.',1,'published',
 '["transport","logistics","fleet","delivery","courier","haulage"]',
 '[{"key":"operator_records","title":"Operator and activity records","description":"Track operating approvals and records confirmed applicable to the business.","evidenceHint":"licences, permits, operator records"},{"key":"fleet_records","title":"Fleet evidence","description":"Maintain current vehicle, service and insurance evidence used by the business.","evidenceHint":"vehicle records, service evidence, insurance"},{"key":"driver_records","title":"Driver records","description":"Maintain current engagement and qualification evidence for drivers where applicable.","evidenceHint":"contracts, licence evidence, training"},{"key":"incident_evidence","title":"Road or delivery incident evidence","description":"Preserve controlled evidence for material road, cargo or delivery incidents.","evidenceHint":"incident record, photos, communications"},{"key":"customer_contracts","title":"Customer/service records","description":"Maintain service-scope, delivery and exception evidence for material customer engagements.","evidenceHint":"contracts, delivery records, exception logs"}]','[]'),
('professional_services','Professional Services Protection Pack','Operational controls for advisory, consulting and professional-service businesses. Legal obligations remain source-gated.',1,'published',
 '["professional services","consulting","accounting","legal","hr","advisory","agency"]',
 '[{"key":"engagement_terms","title":"Client engagement terms","description":"Maintain current scope, fee and responsibility records for client engagements.","evidenceHint":"engagement letters, contracts, approvals"},{"key":"professional_registration","title":"Professional registration register","description":"Track professional registrations or licences that are confirmed applicable.","evidenceHint":"registration or practising evidence"},{"key":"client_data","title":"Client-data controls","description":"Maintain controlled access, retention and sharing of client information.","evidenceHint":"privacy records, access controls, retention rules"},{"key":"conflict_records","title":"Conflict and independence records","description":"Preserve conflict/independence review evidence where relevant to the service.","evidenceHint":"conflict checks, declarations, review notes"},{"key":"workforce_records","title":"Workforce records","description":"Maintain employee and contractor engagement evidence.","evidenceHint":"contracts, role records, access acknowledgements"}]','[]');

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','industry_intelligence',0,NULL),
 ('business','industry_intelligence',1,NULL),
 ('pro','industry_intelligence',1,NULL),
 ('partner','industry_intelligence',1,NULL);


CREATE TABLE IF NOT EXISTS control_library(
  control_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK(category IN ('employment','regulatory','evidence','licence','tender','corporate','privacy','incident')),
  objective TEXT NOT NULL,
  evidence_hint TEXT,
  risk_weight INTEGER NOT NULL DEFAULT 10,
  review_frequency_days INTEGER NOT NULL DEFAULT 90,
  source_policy TEXT NOT NULL DEFAULT 'operational'
    CHECK(source_policy IN ('operational','rule_mapped')),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft','published','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_rule_mappings(
  control_key TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'approved'
    CHECK(mapping_status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(control_key,rule_id),
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_control_status(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review'
    CHECK(status IN ('passing','attention','failed','review','not_applicable')),
  assurance_level TEXT NOT NULL DEFAULT 'unverified'
    CHECK(assurance_level IN ('unverified','self_attested','evidence_backed','reviewed')),
  owner_user_id TEXT,
  due_at TEXT,
  last_tested_at TEXT,
  next_review_at TEXT,
  source_summary_json TEXT NOT NULL DEFAULT '{}',
  evidence_health TEXT NOT NULL DEFAULT 'unknown'
    CHECK(evidence_health IN ('healthy','attention','expired','missing','unknown')),
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenant_control_status_idx
ON tenant_control_status(tenant_id,status,evidence_health,updated_at DESC);

CREATE TABLE IF NOT EXISTS control_evidence_links(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'supporting'
    CHECK(link_type IN ('primary','supporting','test_sample')),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key,evidence_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remediation_cases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK(source_type IN ('risk_event','control','regulatory_change','obligation','evidence')),
  source_id TEXT,
  control_key TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','review','resolved','accepted_risk','canceled')),
  owner_user_id TEXT,
  due_at TEXT,
  requires_professional INTEGER NOT NULL DEFAULT 0,
  service_order_id TEXT,
  risk_acceptance_reason TEXT,
  risk_acceptance_expires_at TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE SET NULL,
  UNIQUE(tenant_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS remediation_cases_tenant_idx
ON remediation_cases(tenant_id,status,severity,due_at);

CREATE TABLE IF NOT EXISTS remediation_case_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remediation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(remediation_id) REFERENCES remediation_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS regulatory_change_cases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  applicability_status TEXT NOT NULL
    CHECK(applicability_status IN ('applies','review','unknown')),
  impact_level TEXT NOT NULL DEFAULT 'review'
    CHECK(impact_level IN ('review','action','urgent')),
  status TEXT NOT NULL DEFAULT 'assessing'
    CHECK(status IN ('assessing','action_required','implemented','dismissed')),
  explanation TEXT NOT NULL,
  obligation_count INTEGER NOT NULL DEFAULT 0,
  owner_user_id TEXT,
  resolution_notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,rule_id)
);
CREATE INDEX IF NOT EXISTS regulatory_change_cases_tenant_idx
ON regulatory_change_cases(tenant_id,status,impact_level,updated_at DESC);

CREATE TABLE IF NOT EXISTS evidence_health_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  approved_count INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  expiring_count INTEGER NOT NULL DEFAULT 0,
  expired_count INTEGER NOT NULL DEFAULT 0,
  missing_required_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_health_snapshots_tenant_idx
ON evidence_health_snapshots(tenant_id,created_at DESC);

ALTER TABLE evidence ADD COLUMN valid_until TEXT;
ALTER TABLE evidence ADD COLUMN superseded_at TEXT;

INSERT OR IGNORE INTO control_library(control_key,name,category,objective,evidence_hint,risk_weight,review_frequency_days,source_policy,status) VALUES
('EMPLOYMENT_RECORDS','Employment records','employment','Maintain current and defensible employment records for active workers.','signed contracts, leave, attendance and review records',18,30,'operational','published'),
('EMPLOYMENT_CASE_PROCESS','Employment case process','employment','Use controlled, documented review for disciplinary, grievance and other high-risk employment cases.','case chronology, notices, minutes and review evidence',18,30,'operational','published'),
('REGULATORY_CHANGE_CONTROL','Regulatory change control','regulatory','Assess published regulatory changes against the company profile and convert applicable changes into controlled actions.','approved source, applicability basis and action record',20,30,'rule_mapped','published'),
('MANDATORY_EVIDENCE','Mandatory evidence assurance','evidence','Ensure evidence required by compliance obligations is approved, current and traceable.','approved evidence linked to obligation or control',18,30,'operational','published'),
('LICENCE_CONTINUITY','Licence continuity','licence','Keep applicable operating licences active and renewal work ahead of recorded due dates.','licence record, renewal proof and authority correspondence',14,30,'operational','published'),
('TENDER_READINESS_CONTROL','Tender readiness control','tender','Keep mandatory tender requirements complete before recorded closing dates.','requirement checklist and approved submission evidence',12,14,'operational','published'),
('CORPORATE_ACTION_CONTROL','Corporate action control','corporate','Keep controlled company/governance actions progressing through required review and completion states.','resolution, filing, approval and completion evidence',10,30,'operational','published'),
('DATA_ACCESS_CONTROL','Data access and privacy control','privacy','Maintain controlled access, handling and retention of company, employee and customer information.','access records, privacy controls and retention decisions',12,90,'operational','published'),
('INCIDENT_EVIDENCE_CONTROL','Incident evidence control','incident','Preserve material incident and corrective-action evidence in a controlled, reviewable trail.','incident report, supporting evidence and corrective action',10,90,'operational','published');

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
('starter','control_assurance',1,NULL),
('business','control_assurance',1,NULL),
('pro','control_assurance',1,NULL),
('partner','control_assurance',1,NULL),
('starter','advanced_remediation',0,NULL),
('business','advanced_remediation',1,NULL),
('pro','advanced_remediation',1,NULL),
('partner','advanced_remediation',1,NULL),
('starter','regulatory_change_control',0,NULL),
('business','regulatory_change_control',1,NULL),
('pro','regulatory_change_control',1,NULL),
('partner','regulatory_change_control',1,NULL),
('starter','evidence_health',1,NULL),
('business','evidence_health',1,NULL),
('pro','evidence_health',1,NULL),
('partner','evidence_health',1,NULL);


CREATE TABLE IF NOT EXISTS control_assurance_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(trigger_type IN ('manual','scheduled','rule_change','evidence_change')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','partial','failed')),
  controls_tested INTEGER NOT NULL DEFAULT 0,
  stale_controls INTEGER NOT NULL DEFAULT 0,
  overdue_controls INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error_summary TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_assurance_runs_tenant_idx
ON control_assurance_runs(tenant_id,started_at DESC);

CREATE TABLE IF NOT EXISTS control_assurance_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  previous_status TEXT,
  result_status TEXT NOT NULL,
  previous_assurance TEXT,
  result_assurance TEXT NOT NULL,
  freshness TEXT NOT NULL
    CHECK(freshness IN ('current','due','overdue','stale','unknown')),
  reason TEXT,
  tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES control_assurance_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_assurance_results_tenant_idx
ON control_assurance_results(tenant_id,control_key,tested_at DESC);

CREATE TABLE IF NOT EXISTS control_review_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('human_review','freshness_changed','owner_changed')),
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_review_events_tenant_idx
ON control_review_events(tenant_id,control_key,occurred_at DESC);

CREATE TABLE IF NOT EXISTS continuous_assurance_state(
  state_key TEXT PRIMARY KEY,
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tenant_control_status ADD COLUMN assurance_freshness TEXT NOT NULL DEFAULT 'unknown'
  CHECK(assurance_freshness IN ('current','due','overdue','stale','unknown'));
ALTER TABLE tenant_control_status ADD COLUMN stale_reason TEXT;
ALTER TABLE tenant_control_status ADD COLUMN last_auto_checked_at TEXT;
ALTER TABLE tenant_control_status ADD COLUMN last_human_review_at TEXT;
ALTER TABLE tenant_control_status ADD COLUMN review_sla_at TEXT;


ALTER TABLE audit_events ADD COLUMN tenant_seq INTEGER;
ALTER TABLE audit_events ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_events ADD COLUMN event_hash TEXT;
ALTER TABLE audit_events ADD COLUMN integrity_version INTEGER;
ALTER TABLE audit_events ADD COLUMN write_source TEXT NOT NULL DEFAULT 'server';
CREATE UNIQUE INDEX IF NOT EXISTS audit_tenant_seq_unique
ON audit_events(tenant_id,tenant_seq) WHERE tenant_seq IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_chain_state(
  tenant_id TEXT PRIMARY KEY,
  last_event_id INTEGER,
  last_hash TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_write_failures(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS audit_write_failures_tenant_idx
ON audit_write_failures(tenant_id,resolved_at,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_integrity_checks(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('valid','invalid','empty','legacy_unsealed')),
  checked_events INTEGER NOT NULL DEFAULT 0,
  legacy_events INTEGER NOT NULL DEFAULT 0,
  first_invalid_seq INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS audit_integrity_checks_tenant_idx
ON audit_integrity_checks(tenant_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS control_lineage_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL,
  assurance_level TEXT NOT NULL,
  assurance_freshness TEXT NOT NULL,
  snapshot_seq INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  prev_snapshot_hash TEXT,
  snapshot_hash TEXT NOT NULL,
  lineage_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_lineage_snapshots_idx
ON control_lineage_snapshots(tenant_id,control_key,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS control_lineage_snapshot_seq_unique
ON control_lineage_snapshots(tenant_id,control_key,snapshot_seq);

CREATE TABLE IF NOT EXISTS control_lineage_state(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  last_snapshot_id TEXT,
  last_content_hash TEXT,
  last_snapshot_hash TEXT,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);

INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','control_lineage',0,NULL),
 ('business','control_lineage',1,NULL),
 ('pro','control_lineage',1,NULL),
 ('partner','control_lineage',1,NULL);


ALTER TABLE regulatory_sources ADD COLUMN submitted_by_user_id TEXT;
ALTER TABLE regulatory_sources ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE regulatory_sources ADD COLUMN approved_at TEXT;
ALTER TABLE regulatory_sources ADD COLUMN content_hash TEXT;
ALTER TABLE regulatory_sources ADD COLUMN metadata_hash TEXT;
ALTER TABLE regulatory_sources ADD COLUMN latest_snapshot_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE regulatory_sources ADD COLUMN last_checked_at TEXT;
ALTER TABLE regulatory_sources ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK(verification_status IN ('unverified','verified','changed','unavailable'));
ALTER TABLE regulatory_rules ADD COLUMN created_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN published_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN approved_at TEXT;
ALTER TABLE regulatory_rules ADD COLUMN published_at TEXT;
ALTER TABLE regulatory_rules ADD COLUMN definition_hash TEXT;
ALTER TABLE regulatory_rules ADD COLUMN supersedes_rule_id TEXT;
ALTER TABLE regulatory_rollout_runs ADD COLUMN cursor_tenant_id TEXT;
ALTER TABLE regulatory_rollout_runs ADD COLUMN tenants_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE regulatory_rollout_runs ADD COLUMN next_run_at TEXT;
CREATE TABLE IF NOT EXISTS regulatory_source_snapshots(
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, metadata_hash TEXT NOT NULL,
  content_excerpt TEXT, object_key TEXT, captured_by_user_id TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE, UNIQUE(source_id,version));
CREATE INDEX IF NOT EXISTS regulatory_source_snapshots_source_idx ON regulatory_source_snapshots(source_id,version DESC);
CREATE TABLE IF NOT EXISTS regulatory_conflict_sources(
  conflict_id TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(conflict_id,source_id),
  FOREIGN KEY(conflict_id) REFERENCES regulatory_conflicts(id) ON DELETE CASCADE, FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS regulatory_conflict_sources_source_idx ON regulatory_conflict_sources(source_id,conflict_id);
CREATE TABLE IF NOT EXISTS regulatory_rollout_failures(
  id TEXT PRIMARY KEY, rollout_id TEXT NOT NULL, tenant_id TEXT NOT NULL, error_message TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT,
  FOREIGN KEY(rollout_id) REFERENCES regulatory_rollout_runs(id) ON DELETE CASCADE, FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(rollout_id,tenant_id));
CREATE INDEX IF NOT EXISTS regulatory_rollout_failures_idx ON regulatory_rollout_failures(rollout_id,resolved_at,last_attempt_at DESC);
CREATE TABLE IF NOT EXISTS platform_regulatory_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, event_data TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS platform_regulatory_audit_idx ON platform_regulatory_audit(occurred_at DESC,action);
CREATE TABLE IF NOT EXISTS regulatory_governance_state(state_key TEXT PRIMARY KEY,state_value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS platform_regulatory_principals(
  user_id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('editor','reviewer','admin')), active INTEGER NOT NULL DEFAULT 1,
  provisioned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS platform_regulatory_principals_role_idx ON platform_regulatory_principals(active,role,email);
ALTER TABLE compliance_obligations ADD COLUMN superseded_by_rule_id TEXT;
ALTER TABLE compliance_obligations ADD COLUMN superseded_at TEXT;


CREATE TABLE IF NOT EXISTS regulatory_seed_registry(
  pack_key TEXT NOT NULL,
  seed_key TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK(entity_type IN ('source','rule','conflict')),
  entity_id TEXT NOT NULL,
  definition_hash TEXT,
  imported_by_user_id TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pack_key,seed_key)
);
CREATE INDEX IF NOT EXISTS regulatory_seed_registry_entity_idx
ON regulatory_seed_registry(entity_type,entity_id);

CREATE TABLE IF NOT EXISTS regulatory_pack_imports(
  id TEXT PRIMARY KEY,
  pack_key TEXT NOT NULL,
  pack_version INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  sources_created INTEGER NOT NULL DEFAULT 0,
  rules_created INTEGER NOT NULL DEFAULT 0,
  conflicts_created INTEGER NOT NULL DEFAULT 0,
  sources_existing INTEGER NOT NULL DEFAULT 0,
  rules_existing INTEGER NOT NULL DEFAULT 0,
  conflicts_existing INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS regulatory_pack_imports_pack_idx
ON regulatory_pack_imports(pack_key,created_at DESC);



ALTER TABLE compliance_obligations ADD COLUMN period_key TEXT;
ALTER TABLE compliance_obligations ADD COLUMN period_start TEXT;
ALTER TABLE compliance_obligations ADD COLUMN period_end TEXT;
ALTER TABLE compliance_obligations ADD COLUMN schedule_type TEXT;
ALTER TABLE compliance_obligations ADD COLUMN deadline_basis_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE compliance_obligations ADD COLUMN generated_by_run_id TEXT;
CREATE INDEX IF NOT EXISTS compliance_obligations_period_idx ON compliance_obligations(tenant_id,rule_id,period_key,due_at);
CREATE TABLE IF NOT EXISTS statutory_deadline_runs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual','scheduled','profile_change','rule_rollout')),status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','partial','failed')),rules_evaluated INTEGER NOT NULL DEFAULT 0,obligations_created INTEGER NOT NULL DEFAULT 0,schedules_needing_input INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,error_summary TEXT,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS statutory_deadline_runs_tenant_idx ON statutory_deadline_runs(tenant_id,started_at DESC);
CREATE TABLE IF NOT EXISTS statutory_schedule_status(tenant_id TEXT NOT NULL,rule_id TEXT NOT NULL,schedule_type TEXT NOT NULL,config_status TEXT NOT NULL CHECK(config_status IN ('ready','needs_input','not_applicable','unsupported')),missing_fields_json TEXT NOT NULL DEFAULT '[]',next_due_at TEXT,last_generated_at TEXT,details_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(tenant_id,rule_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS statutory_schedule_status_idx ON statutory_schedule_status(tenant_id,config_status,next_due_at);
CREATE TABLE IF NOT EXISTS statutory_scheduler_state(state_key TEXT PRIMARY KEY,state_value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);


CREATE TABLE IF NOT EXISTS inspection_scenario_library(
  scenario_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  authority_label TEXT NOT NULL,
  description TEXT NOT NULL,
  control_categories_json TEXT NOT NULL DEFAULT '[]',
  rule_prefixes_json TEXT NOT NULL DEFAULT '[]',
  risk_categories_json TEXT NOT NULL DEFAULT '[]',
  includes_hr_cases INTEGER NOT NULL DEFAULT 0,
  disclaimer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft','published','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_simulation_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  readiness_score INTEGER NOT NULL DEFAULT 0,
  readiness_band TEXT NOT NULL,
  coverage_status TEXT NOT NULL
    CHECK(coverage_status IN ('sufficient','limited','insufficient')),
  critical_findings INTEGER NOT NULL DEFAULT 0,
  high_findings INTEGER NOT NULL DEFAULT 0,
  medium_findings INTEGER NOT NULL DEFAULT 0,
  low_findings INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_key) REFERENCES inspection_scenario_library(scenario_key)
);
CREATE INDEX IF NOT EXISTS inspection_simulation_runs_tenant_idx
ON inspection_simulation_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS inspection_simulation_findings(
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  finding_type TEXT NOT NULL
    CHECK(finding_type IN ('control','obligation','evidence','risk_event','hr_case','coverage')),
  source_id TEXT,
  severity TEXT NOT NULL
    CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','resolved','dismissed')),
  remediation_case_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES inspection_simulation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS inspection_simulation_findings_run_idx
ON inspection_simulation_findings(run_id,severity,status);

CREATE TABLE IF NOT EXISTS hr_case_evidence_links(
  case_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'supporting'
    CHECK(relationship IN ('primary','supporting','contract','notice','minutes','attendance','leave','other')),
  linked_by_user_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(case_id,evidence_id),
  FOREIGN KEY(case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hr_case_evidence_tenant_idx
ON hr_case_evidence_links(tenant_id,case_id,linked_at DESC);

CREATE TABLE IF NOT EXISTS dispute_defense_packs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_type TEXT NOT NULL
    CHECK(case_type IN ('employment')),
  hr_case_id TEXT NOT NULL,
  employee_id TEXT,
  label TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('review_required','assembled','archived')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  gap_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(hr_case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS dispute_defense_packs_tenant_idx
ON dispute_defense_packs(tenant_id,created_at DESC);

INSERT OR IGNORE INTO inspection_scenario_library(
 scenario_key,name,authority_label,description,control_categories_json,rule_prefixes_json,risk_categories_json,includes_hr_cases,disclaimer
) VALUES
 ('burs-tax-records','BURS Tax Records Readiness','BURS','Tests whether the workspace has current tax obligations, evidence and control records likely to matter in a tax-record review.',
  '["regulatory","evidence","corporate"]','["bw.burs."]','["regulatory","evidence","corporate"]',0,
  'Readiness simulation only. It is not a BURS audit checklist, tax opinion, or prediction of an assessment or penalty.'),
 ('cipa-corporate','CIPA Corporate Records Readiness','CIPA','Tests corporate-governance controls, CIPA obligations and supporting evidence.',
  '["corporate","regulatory","evidence"]','["bw.cipa."]','["corporate","regulatory","evidence"]',0,
  'Readiness simulation only. It does not certify CIPA compliance or replace current CIPA records.'),
 ('employment-labour','Employment & Labour Review','Labour / employment review','Tests employment controls, open HR cases, evidence and employment-rule obligations.',
  '["employment","evidence"]','["bw.employment."]','["employment","evidence"]',1,
  'Operational readiness simulation only. It does not determine fairness, legality, liability or the outcome of a labour dispute.'),
 ('data-protection','Data Protection Readiness','Information & Data Protection','Tests privacy, incident and evidence controls against published data-protection rules in the workspace.',
  '["privacy","incident","evidence","regulatory"]','["bw.data-protection."]','["evidence","regulatory"]',0,
  'Operational readiness simulation only. It does not certify statutory compliance or predict regulator action.'),
 ('ppra-tender','PPRA / Tender Readiness','PPRA / procurement','Tests tender controls, registration obligations and evidence readiness.',
  '["tender","evidence","regulatory"]','["bw.ppra."]','["tender","evidence","regulatory"]',0,
  'Tender-readiness simulation only. It does not guarantee eligibility, responsiveness, award or acceptance by a procuring entity.'),
 ('client-due-diligence','Client / Counterparty Due Diligence','Client / counterparty','Tests broad control and evidence readiness for due-diligence requests from customers, banks, insurers or counterparties.',
  '["employment","regulatory","evidence","licence","tender","corporate","privacy","incident"]','[]',
  '["employment","regulatory","evidence","licence","tender","corporate"]',1,
  'Readiness simulation only. Counterparties may request different information and make their own independent decisions.');

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','inspection_simulator',0,NULL),
 ('business','inspection_simulator',1,NULL),
 ('pro','inspection_simulator',1,NULL),
 ('partner','inspection_simulator',1,NULL),
 ('starter','dispute_defense_pack',0,NULL),
 ('business','dispute_defense_pack',1,NULL),
 ('pro','dispute_defense_pack',1,NULL),
 ('partner','dispute_defense_pack',1,NULL);


CREATE TABLE IF NOT EXISTS business_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL
    CHECK(event_category IN ('workforce','tax','corporate','operations','premises','licence','tender','data')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','processing','completed','partial','failed')),
  event_data_json TEXT NOT NULL DEFAULT '{}',
  effects_summary_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,event_key)
);
CREATE INDEX IF NOT EXISTS business_events_tenant_idx
ON business_events(tenant_id,status,occurred_at DESC);

CREATE TABLE IF NOT EXISTS business_event_effects(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  effect_type TEXT NOT NULL
    CHECK(effect_type IN ('regulatory_recheck','statutory_recalc','industry_refresh','assurance_refresh','risk_refresh','inspection_invalidate','passport_invalidate')),
  sequence_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','partial','failed','skipped')),
  cursor_text TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(event_id,effect_type)
);
CREATE INDEX IF NOT EXISTS business_event_effects_queue_idx
ON business_event_effects(status,sequence_no,event_id);

CREATE TABLE IF NOT EXISTS business_event_failures(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  effect_id TEXT,
  tenant_id TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(effect_id) REFERENCES business_event_effects(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_event_failures_idx
ON business_event_failures(tenant_id,resolved_at,created_at DESC);

CREATE TABLE IF NOT EXISTS business_event_engine_state(
  state_key TEXT PRIMARY KEY,
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','business_event_engine',1,NULL),
 ('business','business_event_engine',1,NULL),
 ('pro','business_event_engine',1,NULL),
 ('partner','business_event_engine',1,NULL);


CREATE TABLE IF NOT EXISTS business_event_impacts(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  impact_type TEXT NOT NULL
    CHECK(impact_type IN ('regulatory_rule','statutory_schedule','control','risk_event','inspection_pack','passport_verification')),
  source_id TEXT NOT NULL,
  impact_level TEXT NOT NULL
    CHECK(impact_level IN ('info','review','action','urgent')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(event_id,impact_type,source_id)
);
CREATE INDEX IF NOT EXISTS business_event_impacts_event_idx
ON business_event_impacts(event_id,impact_level,impact_type);


ALTER TABLE partner_tasks ADD COLUMN action_key TEXT;
ALTER TABLE partner_tasks ADD COLUMN source_status TEXT;
ALTER TABLE partner_tasks ADD COLUMN last_seen_at TEXT;
ALTER TABLE partner_tasks ADD COLUMN completed_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS partner_tasks_action_unique
ON partner_tasks(partner_tenant_id,client_tenant_id,action_key)
WHERE action_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS partner_tasks_attention_idx
ON partner_tasks(partner_tenant_id,status,priority,due_at,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS partner_task_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_task_id TEXT NOT NULL,
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('CREATED','REFRESHED','STATUS_CHANGED','SOURCE_RESOLVED')),
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(partner_task_id) REFERENCES partner_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_task_events_task_idx
ON partner_task_events(partner_task_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS partner_portfolio_refresh_runs(
  id TEXT PRIMARY KEY,
  partner_tenant_id TEXT NOT NULL,
  clients_scanned INTEGER NOT NULL DEFAULT 0,
  actions_seen INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  tasks_refreshed INTEGER NOT NULL DEFAULT 0,
  tasks_resolved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(partner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_portfolio_refresh_idx
ON partner_portfolio_refresh_runs(partner_tenant_id,created_at DESC);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','partner_action_center',0,NULL),
 ('business','partner_action_center',0,NULL),
 ('pro','partner_action_center',0,NULL),
 ('partner','partner_action_center',1,NULL);


ALTER TABLE passport_shares ADD COLUMN invalidated_at TEXT;
ALTER TABLE passport_shares ADD COLUMN invalidation_reason TEXT;
ALTER TABLE passport_shares ADD COLUMN issued_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE passport_shares ADD COLUMN issued_snapshot_hash TEXT;

CREATE TABLE IF NOT EXISTS passport_state(
  tenant_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  last_reason TEXT,
  last_source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO passport_state(tenant_id,revision,last_reason)
SELECT id,0,'v63_baseline' FROM tenants;

CREATE TABLE IF NOT EXISTS passport_public_receipts(
  id TEXT PRIMARY KEY,
  receipt_code TEXT NOT NULL UNIQUE,
  share_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  passport_revision INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  receipt_signature TEXT NOT NULL,
  public_snapshot_json TEXT NOT NULL,
  control_count INTEGER NOT NULL DEFAULT 0,
  score_value INTEGER,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(share_id) REFERENCES passport_shares(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_public_receipts_share_idx
ON passport_public_receipts(share_id,issued_at DESC);

CREATE TABLE IF NOT EXISTS passport_share_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('CREATED','VIEWED','INVALIDATED','REVOKED')),
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(share_id) REFERENCES passport_shares(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS passport_share_events_share_idx
ON passport_share_events(share_id,occurred_at DESC);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','institutional_passport',0,NULL),
 ('business','institutional_passport',0,NULL),
 ('pro','institutional_passport',1,NULL),
 ('partner','institutional_passport',1,NULL);


-- v63 trust-boundary reset: legacy Passport status was user-writable in earlier releases.
UPDATE passport_verifications
SET status='review',
    verified_at=NULL,
    metadata_json='{"source":"v63_migration","reason":"assurance_reverification_required"}'
WHERE status='verified';

UPDATE passport_shares
SET invalidated_at=CURRENT_TIMESTAMP,
    invalidation_reason='v63_security_reissue_required'
WHERE revoked_at IS NULL AND invalidated_at IS NULL;

UPDATE passport_state
SET revision=revision+1,
    last_reason='v63_security_reissue_required',
    updated_at=CURRENT_TIMESTAMP;

INSERT INTO passport_share_events(share_id,tenant_id,event_type,event_data)
SELECT id,tenant_id,'INVALIDATED','{"reason":"v63_security_reissue_required"}'
FROM passport_shares
WHERE invalidation_reason='v63_security_reissue_required';


ALTER TABLE notification_preferences ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Africa/Gaborone';

CREATE TABLE IF NOT EXISTS regulatory_source_reviews(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','conflict')),
  content_hash TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS regulatory_source_reviews_source_idx
ON regulatory_source_reviews(source_id,created_at DESC);

CREATE TABLE IF NOT EXISTS regulatory_rule_reviews(
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','blocked')),
  definition_hash TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS regulatory_rule_reviews_rule_idx
ON regulatory_rule_reviews(rule_id,created_at DESC);


CREATE TABLE IF NOT EXISTS payment_verification_attempts(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK(trigger_type IN ('browser_return','webhook','internal_reconcile','scheduled_reconcile','provider_acknowledge')),
  provider_result_code TEXT,
  provider_result_text TEXT,
  provider_amount TEXT,
  provider_currency TEXT,
  provider_reference TEXT,
  fraud_code TEXT,
  verification_status TEXT NOT NULL
    CHECK(verification_status IN ('verified_paid','pending','failed','mismatch','fraud_review','provider_error','not_configured')),
  response_hash TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_verification_attempts_order_idx
ON payment_verification_attempts(payment_order_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS payment_fulfillments(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_type TEXT NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'applied'
    CHECK(fulfillment_status IN ('applied','legacy_assumed_applied','reversed','manual_review')),
  fulfillment_json TEXT NOT NULL DEFAULT '{}',
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_fulfillments_tenant_idx
ON payment_fulfillments(tenant_id,applied_at DESC);

CREATE TABLE IF NOT EXISTS payment_refund_requests(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount_bwp INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','processing','succeeded','failed','manual_review')),
  provider_result_code TEXT,
  provider_result_text TEXT,
  reversal_status TEXT,
  requested_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_refund_requests_order_idx
ON payment_refund_requests(payment_order_id,created_at DESC);

-- Prevent old paid orders from being fulfilled a second time after v65.
INSERT OR IGNORE INTO payment_fulfillments(payment_order_id,tenant_id,order_type,fulfillment_status,fulfillment_json,applied_at)
SELECT id,tenant_id,order_type,'legacy_assumed_applied','{"source":"v65_migration"}',COALESCE(paid_at,updated_at,created_at)
FROM payment_orders WHERE status IN ('paid','refunded');


CREATE TABLE IF NOT EXISTS payment_settlement_claims(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK(status IN ('processing','applied','failed','legacy_assumed_applied')),
  claim_token TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  last_error TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO payment_settlement_claims(payment_order_id,tenant_id,status,claim_token,claimed_at,applied_at)
SELECT id,tenant_id,'legacy_assumed_applied','legacy-v65',COALESCE(paid_at,updated_at,created_at),COALESCE(paid_at,updated_at,created_at)
FROM payment_orders WHERE status IN ('paid','refunded');

CREATE UNIQUE INDEX IF NOT EXISTS payment_refund_active_unique
ON payment_refund_requests(payment_order_id)
WHERE status IN ('processing','succeeded');



CREATE TABLE IF NOT EXISTS payment_integrity_anomalies(
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  payment_order_id TEXT,
  provider TEXT,
  anomaly_type TEXT NOT NULL
    CHECK(anomaly_type IN ('duplicate_provider_token','duplicate_provider_payment_id')),
  provider_reference TEXT,
  resolution TEXT NOT NULL DEFAULT 'quarantined',
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS payment_integrity_anomalies_idx
ON payment_integrity_anomalies(anomaly_type,detected_at DESC);

INSERT INTO payment_integrity_anomalies(id,tenant_id,payment_order_id,provider,anomaly_type,provider_reference,resolution)
SELECT lower(hex(randomblob(16))),s.tenant_id,s.payment_order_id,s.provider,'duplicate_provider_token',s.provider_token,'quarantined_token_removed'
FROM payment_provider_sessions s
WHERE s.provider_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_provider_sessions x
    WHERE x.provider=s.provider AND x.provider_token=s.provider_token AND x.payment_order_id<s.payment_order_id
  );

UPDATE payment_provider_sessions
SET provider_token=NULL,checkout_url=NULL,provider_status='manual_review_duplicate_token',updated_at=CURRENT_TIMESTAMP
WHERE provider_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_provider_sessions x
    WHERE x.provider=payment_provider_sessions.provider
      AND x.provider_token=payment_provider_sessions.provider_token
      AND x.payment_order_id<payment_provider_sessions.payment_order_id
  );

INSERT INTO payment_integrity_anomalies(id,tenant_id,payment_order_id,provider,anomaly_type,provider_reference,resolution)
SELECT lower(hex(randomblob(16))),o.tenant_id,o.id,o.provider,'duplicate_provider_payment_id',o.provider_payment_id,'quarantined_reference_removed'
FROM payment_orders o
WHERE o.provider_payment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_orders x
    WHERE x.provider=o.provider AND x.provider_payment_id=o.provider_payment_id AND x.id<o.id
  );

UPDATE payment_orders
SET provider_payment_id=NULL,updated_at=CURRENT_TIMESTAMP
WHERE provider_payment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_orders x
    WHERE x.provider=payment_orders.provider
      AND x.provider_payment_id=payment_orders.provider_payment_id
      AND x.id<payment_orders.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_session_token_unique
ON payment_provider_sessions(provider,provider_token)
WHERE provider_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_order_provider_payment_unique
ON payment_orders(provider,provider_payment_id)
WHERE provider_payment_id IS NOT NULL;


ALTER TABLE payment_provider_sessions ADD COLUMN website_verify_status TEXT;
ALTER TABLE payment_provider_sessions ADD COLUMN website_verified_at TEXT;


ALTER TABLE evidence ADD COLUMN scan_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN scan_last_error TEXT;
ALTER TABLE evidence ADD COLUMN scanned_at TEXT;
ALTER TABLE evidence ADD COLUMN scanner_provider TEXT;
ALTER TABLE evidence ADD COLUMN scan_result_hash TEXT;
ALTER TABLE evidence ADD COLUMN malware_name TEXT;
ALTER TABLE evidence ADD COLUMN clean_object_key TEXT;

CREATE TABLE IF NOT EXISTS evidence_scan_events(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scanner_provider TEXT,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('QUEUED','STARTED','CLEAN','INFECTED','ERROR','RETRY','LEGACY_RESET')),
  status_before TEXT,
  status_after TEXT,
  result_hash TEXT,
  malware_name TEXT,
  error_text TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_scan_events_evidence_idx
ON evidence_scan_events(evidence_id,created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_access_events(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('DOWNLOAD','DOWNLOAD_BLOCKED','SCAN_RETRY')),
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS evidence_access_events_tenant_idx
ON evidence_access_events(tenant_id,created_at DESC);

-- v66 trust-boundary reset: quarantine is not malware scanning.
UPDATE evidence
SET review_status='quarantined',
    reviewed_at=NULL,
    reviewed_by_user_id=NULL,
    scan_status='legacy_unscanned'
WHERE deleted_at IS NULL
  AND review_status='approved'
  AND COALESCE(scan_status,'') NOT IN ('clean');

INSERT INTO evidence_scan_events(id,evidence_id,tenant_id,event_type,status_before,status_after,details_json)
SELECT lower(hex(randomblob(16))),id,tenant_id,'LEGACY_RESET','review_required','legacy_unscanned',
       '{"reason":"v66_malware_scan_required_before_approval"}'
FROM evidence
WHERE deleted_at IS NULL AND scan_status='legacy_unscanned';


-- Invalidate downstream claims that depended on evidence demoted by the v66 trust reset.
UPDATE obligation_evidence_requirements
SET status='attached'
WHERE evidence_id IN (
  SELECT id FROM evidence WHERE scan_status='legacy_unscanned'
) AND status='verified';

UPDATE tenant_control_status
SET status=CASE WHEN status='not_applicable' THEN status ELSE 'review' END,
    assurance_level=CASE WHEN assurance_level IN ('evidence_backed','reviewed') THEN 'unverified' ELSE assurance_level END,
    evidence_health='missing',
    updated_at=CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM control_evidence_links l
  JOIN evidence e ON e.id=l.evidence_id
  WHERE l.tenant_id=tenant_control_status.tenant_id
    AND l.control_key=tenant_control_status.control_key
    AND e.scan_status='legacy_unscanned'
);

UPDATE passport_verifications
SET status='review',verified_at=NULL,
    metadata_json='{"source":"v66_migration","reason":"evidence_scan_reverification_required"}'
WHERE EXISTS (
  SELECT 1 FROM control_evidence_links l
  JOIN evidence e ON e.id=l.evidence_id
  WHERE l.tenant_id=passport_verifications.tenant_id
    AND l.control_key=passport_verifications.control_key
    AND e.scan_status='legacy_unscanned'
);

UPDATE passport_state
SET revision=revision+1,
    last_reason='v66_evidence_scan_reverification_required',
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id IN (
  SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
);

UPDATE passport_shares
SET invalidated_at=COALESCE(invalidated_at,CURRENT_TIMESTAMP),
    invalidation_reason=COALESCE(invalidation_reason,'v66_evidence_scan_reverification_required')
WHERE tenant_id IN (
  SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
) AND revoked_at IS NULL;

INSERT INTO passport_share_events(share_id,tenant_id,event_type,event_data)
SELECT id,tenant_id,'INVALIDATED','{"reason":"v66_evidence_scan_reverification_required"}'
FROM passport_shares
WHERE invalidation_reason='v66_evidence_scan_reverification_required'
  AND NOT EXISTS (
    SELECT 1 FROM passport_share_events x
    WHERE x.share_id=passport_shares.id
      AND x.event_type='INVALIDATED'
      AND x.event_data='{"reason":"v66_evidence_scan_reverification_required"}'
  );

UPDATE inspection_packs
SET status='stale'
WHERE status='ready'
  AND tenant_id IN (
    SELECT DISTINCT tenant_id FROM evidence WHERE scan_status='legacy_unscanned'
  );

UPDATE dispute_defense_packs
SET status='review_required'
WHERE status='assembled'
  AND EXISTS (
    SELECT 1 FROM hr_case_evidence_links l
    JOIN evidence e ON e.id=l.evidence_id
    WHERE l.tenant_id=dispute_defense_packs.tenant_id
      AND l.case_id=dispute_defense_packs.hr_case_id
      AND e.scan_status='legacy_unscanned'
  );
-- v73: multi-location daily employee reporting and grounded AI management summaries.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operating_locations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  town TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS operating_locations_tenant_idx ON operating_locations(tenant_id,active,name);
CREATE UNIQUE INDEX IF NOT EXISTS operating_locations_tenant_code_uq ON operating_locations(tenant_id,code) WHERE code IS NOT NULL AND code<>'';

CREATE TABLE IF NOT EXISTS employee_reporting_access(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  last_rotated_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employee_reporting_access_tenant_idx ON employee_reporting_access(tenant_id,status,location_id,employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS employee_reporting_access_active_uq ON employee_reporting_access(tenant_id,employee_id,location_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS daily_employee_reports(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  work_summary TEXT NOT NULL DEFAULT '',
  wins TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  incidents TEXT NOT NULL DEFAULT '',
  next_plan TEXT NOT NULL DEFAULT '',
  kpi_json TEXT NOT NULL DEFAULT '{}',
  needs_attention INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'employee_link' CHECK(source IN ('employee_link','manager_entry','import')),
  revision_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,employee_id,location_id,report_date)
);
CREATE INDEX IF NOT EXISTS daily_employee_reports_tenant_date_idx ON daily_employee_reports(tenant_id,report_date,location_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS daily_employee_reports_employee_date_idx ON daily_employee_reports(tenant_id,employee_id,report_date DESC);

CREATE TABLE IF NOT EXISTS daily_report_revisions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(report_id) REFERENCES daily_employee_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS daily_report_revisions_report_idx ON daily_report_revisions(report_id,revision_no DESC);
CREATE UNIQUE INDEX IF NOT EXISTS daily_report_revisions_report_revision_uq ON daily_report_revisions(report_id,revision_no);
CREATE TRIGGER IF NOT EXISTS daily_employee_reports_revision_snapshot
BEFORE UPDATE OF work_summary,wins,blockers,incidents,next_plan,kpi_json,needs_attention,revision_count ON daily_employee_reports
WHEN NEW.revision_count=OLD.revision_count+1
BEGIN
  INSERT INTO daily_report_revisions(report_id,tenant_id,revision_no,snapshot_json)
  VALUES(OLD.id,OLD.tenant_id,OLD.revision_count,json_object(
    'workSummary',OLD.work_summary,'wins',OLD.wins,'blockers',OLD.blockers,'incidents',OLD.incidents,
    'nextPlan',OLD.next_plan,'kpis',json(OLD.kpi_json),'needsAttention',OLD.needs_attention,'updatedAt',OLD.updated_at
  ));
END;

CREATE TABLE IF NOT EXISTS daily_reporting_settings(
  tenant_id TEXT PRIMARY KEY,
  auto_summary_enabled INTEGER NOT NULL DEFAULT 0,
  digest_hour_local INTEGER NOT NULL DEFAULT 18,
  digest_minute_local INTEGER NOT NULL DEFAULT 15,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_operations_summaries(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  summary_date TEXT NOT NULL,
  location_id TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER NOT NULL DEFAULT 0,
  generation_mode TEXT NOT NULL CHECK(generation_mode IN ('workers_ai','structured_fallback')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual','scheduled')),
  model TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  narrative_json TEXT NOT NULL DEFAULT '{}',
  source_report_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS daily_operations_summaries_tenant_date_idx ON daily_operations_summaries(tenant_id,summary_date,created_at DESC);


-- v73 reporting exceptions
CREATE TABLE IF NOT EXISTS daily_reporting_exceptions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('leave','rest_day','field_assignment','training','connectivity','other')),
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,employee_id,location_id,report_date)
);
CREATE INDEX IF NOT EXISTS daily_reporting_exceptions_date_idx ON daily_reporting_exceptions(tenant_id,report_date,location_id);
-- v74: auditable performance learning, baseline memory, feedback and notifications.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_performance_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  coverage REAL NOT NULL DEFAULT 0,
  reports_received INTEGER NOT NULL DEFAULT 0,
  reports_expected INTEGER NOT NULL DEFAULT 0,
  tasks REAL NOT NULL DEFAULT 0,
  customers REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  incidents REAL NOT NULL DEFAULT 0,
  attention REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_performance_snapshots_uq ON daily_performance_snapshots(tenant_id,snapshot_date,COALESCE(location_id,''));
CREATE INDEX IF NOT EXISTS daily_performance_snapshots_history_idx ON daily_performance_snapshots(tenant_id,location_id,snapshot_date DESC);

CREATE TABLE IF NOT EXISTS performance_alert_settings(
  tenant_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  notify_deterioration INTEGER NOT NULL DEFAULT 1,
  notify_improvement INTEGER NOT NULL DEFAULT 1,
  notify_reporting_gap INTEGER NOT NULL DEFAULT 1,
  notify_incidents INTEGER NOT NULL DEFAULT 1,
  notify_in_app INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 0,
  coverage_drop_points REAL NOT NULL DEFAULT 20,
  metric_drop_percent REAL NOT NULL DEFAULT 30,
  improvement_percent REAL NOT NULL DEFAULT 25,
  incident_spike_count REAL NOT NULL DEFAULT 2,
  recurring_days INTEGER NOT NULL DEFAULT 3,
  min_baseline_days INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_learning_profiles(
  tenant_id TEXT NOT NULL,
  location_key TEXT NOT NULL DEFAULT '__all__',
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  sample_days INTEGER NOT NULL DEFAULT 0,
  baseline_7d_json TEXT NOT NULL DEFAULT '{}',
  baseline_30d_json TEXT NOT NULL DEFAULT '{}',
  recurring_themes_json TEXT NOT NULL DEFAULT '[]',
  feedback_context_json TEXT NOT NULL DEFAULT '{}',
  summary_memory_json TEXT NOT NULL DEFAULT '[]',
  learning_status TEXT NOT NULL DEFAULT 'learning' CHECK(learning_status IN ('learning','active','limited')),
  learned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,location_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_insights(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  insight_date TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','positive','warning','critical')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  current_json TEXT NOT NULL DEFAULT '{}',
  baseline_json TEXT NOT NULL DEFAULT '{}',
  ai_narrative_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_insights_dedupe_uq ON performance_insights(tenant_id,insight_date,COALESCE(location_id,''),signal_type);
CREATE INDEX IF NOT EXISTS performance_insights_open_idx ON performance_insights(tenant_id,status,insight_date DESC,severity);

CREATE TABLE IF NOT EXISTS performance_feedback(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  summary_id TEXT,
  insight_id TEXT,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK(rating IN ('useful','not_useful')),
  outcome TEXT CHECK(outcome IN ('watch','resolved','false_positive','actioned','other')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(summary_id) REFERENCES daily_operations_summaries(id) ON DELETE SET NULL,
  FOREIGN KEY(insight_id) REFERENCES performance_insights(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS performance_feedback_tenant_idx ON performance_feedback(tenant_id,created_at DESC);


-- v76: consented Meta WhatsApp utility notifications and auditable delivery states.
ALTER TABLE notification_outbox ADD COLUMN dedupe_key TEXT;
ALTER TABLE notification_outbox ADD COLUMN processing_at TEXT;
ALTER TABLE notification_outbox ADD COLUMN provider_status TEXT;
ALTER TABLE notification_outbox ADD COLUMN provider_status_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_external_dedupe_uq
ON notification_outbox(tenant_id,channel,recipient_ref,dedupe_key)
WHERE dedupe_key IS NOT NULL AND recipient_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_outbox_processing_idx ON notification_outbox(status,processing_at);

CREATE TABLE IF NOT EXISTS whatsapp_consents(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  consent_source TEXT NOT NULL DEFAULT 'account_settings',
  consent_text_version TEXT NOT NULL,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_consents_active_idx ON whatsapp_consents(tenant_id,status,user_id);

CREATE TABLE IF NOT EXISTS whatsapp_delivery_events(
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','sent','delivered','read','failed')),
  provider_timestamp TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  raw_event_hash TEXT,
  event_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(notification_id) REFERENCES notification_outbox(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_message_idx ON whatsapp_delivery_events(provider_message_id,provider_timestamp);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_notification_idx ON whatsapp_delivery_events(notification_id,provider_timestamp);

ALTER TABLE performance_alert_settings ADD COLUMN notify_whatsapp INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','whatsapp_notifications',1,20),
 ('business','whatsapp_notifications',1,80),
 ('pro','whatsapp_notifications',1,300),
 ('network','whatsapp_notifications',1,1000),
 ('partner','whatsapp_notifications',1,2000);

-- v77: evidence-backed CIPA/OBRS registry snapshots and explicit profile reconciliation.
CREATE TABLE IF NOT EXISTS cipa_registry_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obrs_company_extract','cipa_register_search')),
  source_observed_at TEXT NOT NULL,
  evidence_id TEXT,
  registration_number TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  state_version_at_import INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  UNIQUE(tenant_id,company_id,content_hash),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS cipa_registry_snapshots_company_idx
ON cipa_registry_snapshots(tenant_id,company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS cipa_reconciliation_items(
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK(field_key IN ('registration_number','legal_name','entity_type','registration_status','registration_date','annual_return_month','registered_office')),
  internal_value TEXT NOT NULL DEFAULT '',
  registry_value TEXT NOT NULL DEFAULT '',
  internal_value_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('matched','pending','applied_registry','kept_internal','superseded')),
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_id,field_key),
  FOREIGN KEY(snapshot_id) REFERENCES cipa_registry_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS cipa_reconciliation_items_pending_idx
ON cipa_reconciliation_items(tenant_id,company_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS management_review_assignments(
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,source_type,source_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS management_review_assignments_reviewer_idx
ON management_review_assignments(tenant_id,reviewer_user_id,assigned_at);

CREATE TABLE IF NOT EXISTS management_review_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('assigned','claimed','approved','returned')),
  actor_user_id TEXT NOT NULL,
  reviewer_user_id TEXT,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS management_review_events_source_idx
ON management_review_events(tenant_id,source_type,source_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS management_review_decisions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','return')),
  validity_status TEXT NOT NULL DEFAULT 'pending' CHECK(validity_status IN ('pending','valid','stale','returned')),
  reviewer_user_id TEXT,
  reviewer_name TEXT NOT NULL,
  decision_note TEXT NOT NULL,
  attestation_text TEXT NOT NULL,
  attested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  source_hash TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL DEFAULT '[]',
  evidence_hash TEXT NOT NULL,
  sealed_at TEXT,
  invalidated_at TEXT,
  invalidation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS management_review_decisions_tenant_idx
ON management_review_decisions(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS management_review_decisions_source_idx
ON management_review_decisions(tenant_id,source_type,source_id,created_at DESC);
CREATE INDEX IF NOT EXISTS management_review_decisions_validity_idx
ON management_review_decisions(tenant_id,validity_status,created_at DESC);
CREATE TABLE IF NOT EXISTS management_rereview_queue(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','claimed','resolved','superseded')),
  reason TEXT NOT NULL,
  changed_json TEXT NOT NULL DEFAULT '[]',
  reviewer_user_id TEXT,
  response_due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  resolved_at TEXT,
  resolved_by_decision_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(decision_id) REFERENCES management_review_decisions(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(resolved_by_decision_id) REFERENCES management_review_decisions(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,decision_id)
);
CREATE INDEX IF NOT EXISTS management_rereview_queue_status_idx ON management_rereview_queue(tenant_id,status,response_due_at);
CREATE INDEX IF NOT EXISTS management_rereview_queue_reviewer_idx ON management_rereview_queue(tenant_id,reviewer_user_id,status,response_due_at);

-- v78 1.21.36 — executive intervention closure.
CREATE TABLE IF NOT EXISTS executive_exception_interventions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  exception_key TEXT NOT NULL,
  exception_kind TEXT NOT NULL,
  exception_title TEXT NOT NULL,
  exception_target TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('open','claimed','ready_to_close','closed','superseded')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  decision TEXT NOT NULL,
  decision_note TEXT NOT NULL,
  recovery_due_at TEXT NOT NULL,
  progress_status TEXT NOT NULL DEFAULT 'not_started' CHECK(progress_status IN ('not_started','on_track','at_risk','blocked')),
  progress_note TEXT,
  progress_updated_at TEXT,
  progress_updated_by_user_id TEXT,
  recovery_extension_count INTEGER NOT NULL DEFAULT 0 CHECK(recovery_extension_count>=0),
  blocked_checkpoint_count INTEGER NOT NULL DEFAULT 0 CHECK(blocked_checkpoint_count>=0),
  at_risk_checkpoint_count INTEGER NOT NULL DEFAULT 0 CHECK(at_risk_checkpoint_count>=0),
  reopen_count INTEGER NOT NULL DEFAULT 0 CHECK(reopen_count>=0),
  missed_recovery_count INTEGER NOT NULL DEFAULT 0 CHECK(missed_recovery_count>=0),
  last_missed_recovery_due_at TEXT,
  last_recovery_extended_at TEXT,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  underlying_cleared_at TEXT,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closure_note TEXT,
  closure_evidence_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(progress_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_exception_interventions_active_idx
ON executive_exception_interventions(tenant_id,exception_key)
WHERE status IN ('open','claimed','ready_to_close');
CREATE INDEX IF NOT EXISTS executive_exception_interventions_status_idx
ON executive_exception_interventions(tenant_id,status,recovery_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_exception_interventions_owner_idx
ON executive_exception_interventions(tenant_id,owner_user_id,status,recovery_due_at);
CREATE INDEX IF NOT EXISTS executive_exception_interventions_followup_idx
ON executive_exception_interventions(tenant_id,status,recovery_due_at,progress_updated_at,progress_status);
CREATE INDEX IF NOT EXISTS executive_exception_interventions_accountability_idx
ON executive_exception_interventions(tenant_id,updated_at,recovery_extension_count,blocked_checkpoint_count,reopen_count,missed_recovery_count);

-- v78 1.21.39 — systemic corrective-action closure.
CREATE TABLE IF NOT EXISTS executive_corrective_actions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','superseded')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  target_due_at TEXT NOT NULL,
  target_extension_count INTEGER NOT NULL DEFAULT 0 CHECK(target_extension_count>=0),
  last_target_extended_at TEXT,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closure_note TEXT,
  closure_evidence TEXT,
  baseline_counts_json TEXT NOT NULL,
  closure_counts_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_corrective_actions_active_idx
ON executive_corrective_actions(tenant_id,intervention_id)
WHERE status='open';
CREATE INDEX IF NOT EXISTS executive_corrective_actions_due_idx
ON executive_corrective_actions(tenant_id,status,target_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_corrective_actions_owner_idx
ON executive_corrective_actions(tenant_id,owner_user_id,status,target_due_at);


-- v78 1.21.40 — corrective-action effectiveness verification.
-- Root-cause remediation is not considered stabilized until a defined monitoring period and evidence-backed effectiveness decision are complete.
CREATE TABLE IF NOT EXISTS executive_corrective_effectiveness_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK(status IN ('monitoring','ready','passed','failed')),
  monitoring_days INTEGER NOT NULL CHECK(monitoring_days BETWEEN 14 AND 90),
  monitoring_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monitoring_due_at TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  verification_evidence TEXT,
  verification_note TEXT,
  failure_reason TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,corrective_action_id)
);
CREATE INDEX IF NOT EXISTS executive_corrective_effectiveness_status_idx
ON executive_corrective_effectiveness_reviews(tenant_id,status,monitoring_due_at);
CREATE INDEX IF NOT EXISTS executive_corrective_effectiveness_action_idx
ON executive_corrective_effectiveness_reviews(tenant_id,corrective_action_id,status);

-- v78 1.21.41 — control sustainability monitoring.
-- Effectiveness verification starts a quiet 90-day sustainability watch; later recurrence removes the current sustained state without rewriting historical evidence.
CREATE TABLE IF NOT EXISTS executive_corrective_sustainability_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  effectiveness_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'watching' CHECK(status IN ('watching','sustained','relapsed')),
  watch_days INTEGER NOT NULL DEFAULT 90 CHECK(watch_days BETWEEN 30 AND 180),
  watch_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  watch_due_at TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  last_checked_at TEXT,
  sustained_at TEXT,
  relapsed_at TEXT,
  relapse_reason TEXT,
  warning_started_at TEXT,
  warning_reason TEXT,
  warning_counts_json TEXT,
  warning_cleared_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(effectiveness_review_id) REFERENCES executive_corrective_effectiveness_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,effectiveness_review_id)
);
CREATE INDEX IF NOT EXISTS executive_corrective_sustainability_status_idx
ON executive_corrective_sustainability_reviews(tenant_id,status,watch_due_at);
CREATE INDEX IF NOT EXISTS executive_corrective_sustainability_action_idx
ON executive_corrective_sustainability_reviews(tenant_id,corrective_action_id,status);

-- v78 1.21.42 — control relapse prevention.
-- Early drift creates one small leadership preventive action; repeated drift escalates to full relapse.
CREATE TABLE IF NOT EXISTS executive_control_preventive_actions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sustainability_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','superseded')),
  trigger_kind TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  trigger_counts_json TEXT NOT NULL,
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  preventive_action TEXT NOT NULL,
  target_due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  completed_by_user_id TEXT,
  completion_note TEXT,
  completion_evidence TEXT,
  superseded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(sustainability_review_id) REFERENCES executive_corrective_sustainability_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_control_preventive_open_idx
ON executive_control_preventive_actions(tenant_id,sustainability_review_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS executive_control_preventive_status_idx
ON executive_control_preventive_actions(tenant_id,status,target_due_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_action_idx
ON executive_control_preventive_actions(tenant_id,corrective_action_id,opened_at);



-- v78 1.21.43 — preventive-action effectiveness verification.
-- Preventive task completion starts observation; only evidence-backed verification clears the early-warning state.
CREATE TABLE IF NOT EXISTS executive_control_preventive_effectiveness_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  preventive_action_id TEXT NOT NULL,
  sustainability_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK(status IN ('monitoring','ready','passed','failed','superseded')),
  observation_days INTEGER NOT NULL DEFAULT 7 CHECK(observation_days BETWEEN 3 AND 30),
  observation_started_at TEXT NOT NULL,
  observation_due_at TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  verification_evidence TEXT,
  verification_note TEXT,
  failure_reason TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(preventive_action_id) REFERENCES executive_control_preventive_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(sustainability_review_id) REFERENCES executive_corrective_sustainability_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,preventive_action_id)
);
CREATE INDEX IF NOT EXISTS executive_control_preventive_effectiveness_status_idx
ON executive_control_preventive_effectiveness_reviews(tenant_id,status,observation_due_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_effectiveness_action_idx
ON executive_control_preventive_effectiveness_reviews(tenant_id,corrective_action_id,observation_started_at);

-- v78 1.21.44 — preventive-action pattern learning.
-- Repeated weak preventive controls are tracked at intervention/control level, never as employee or manager scores.
CREATE TABLE IF NOT EXISTS executive_control_preventive_patterns(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'replacement_required' CHECK(status IN ('replacement_required','resolved')),
  lookback_days INTEGER NOT NULL DEFAULT 180 CHECK(lookback_days BETWEEN 30 AND 365),
  preventive_action_count INTEGER NOT NULL DEFAULT 0,
  failed_effectiveness_count INTEGER NOT NULL DEFAULT 0,
  superseded_action_count INTEGER NOT NULL DEFAULT 0,
  repeated_trigger_kind TEXT,
  repeated_trigger_count INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'high' CHECK(severity IN ('high','critical')),
  reason TEXT NOT NULL,
  stats_json TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  resolution_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,intervention_id)
);
CREATE INDEX IF NOT EXISTS executive_control_preventive_pattern_status_idx
ON executive_control_preventive_patterns(tenant_id,status,severity,last_seen_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_pattern_intervention_idx
ON executive_control_preventive_patterns(tenant_id,intervention_id,status);


-- v78 1.21.45 — control replacement governance.
-- Weak preventive controls require a documented retirement/replacement plan and proof that the old control is no longer relied upon.
CREATE TABLE IF NOT EXISTS executive_control_replacement_governance(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  preventive_pattern_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','retired','verified')),
  retired_control TEXT NOT NULL,
  replacement_control TEXT NOT NULL,
  stronger_reason TEXT NOT NULL,
  transition_risk TEXT NOT NULL,
  transition_mitigation TEXT NOT NULL,
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  implementation_due_at TEXT NOT NULL,
  replacement_corrective_action_id TEXT,
  retirement_evidence TEXT,
  retirement_note TEXT,
  retired_at TEXT,
  retired_by_user_id TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(preventive_pattern_id) REFERENCES executive_control_preventive_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(replacement_corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE SET NULL,
  FOREIGN KEY(retired_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_control_replacement_governance_active_idx
ON executive_control_replacement_governance(tenant_id,preventive_pattern_id) WHERE status IN ('planned','retired');
CREATE INDEX IF NOT EXISTS executive_control_replacement_governance_status_idx
ON executive_control_replacement_governance(tenant_id,status,implementation_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_control_replacement_governance_intervention_idx
ON executive_control_replacement_governance(tenant_id,intervention_id,opened_at);
-- V78 1.21.47 public authentication abuse controls. Raw IP/email values are never stored.
CREATE TABLE IF NOT EXISTS auth_rate_limits(
  key_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  window_start INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS auth_rate_limits_scope_expiry_idx ON auth_rate_limits(scope,expires_at);


-- V78 1.21.52 — verifiable tenant-data purge completion tombstones.
-- No raw tenant/user identifiers or business content are retained after deletion.
CREATE TABLE IF NOT EXISTS deletion_tombstones(
  request_id TEXT PRIMARY KEY,
  tenant_fingerprint TEXT NOT NULL UNIQUE,
  purge_version TEXT NOT NULL DEFAULT 'v1',
  evidence_records_purged INTEGER NOT NULL DEFAULT 0 CHECK(evidence_records_purged >= 0),
  evidence_objects_purged INTEGER NOT NULL DEFAULT 0 CHECK(evidence_objects_purged >= 0),
  orphan_users_purged INTEGER NOT NULL DEFAULT 0 CHECK(orphan_users_purged >= 0),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deletion_tombstones_completed_idx ON deletion_tombstones(completed_at);

-- V78 v1.21.53 scheduled-job observability / replay ledger.
CREATE TABLE IF NOT EXISTS platform_scheduled_runs(
  id TEXT PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  cron TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_summary TEXT
);
CREATE INDEX IF NOT EXISTS platform_scheduled_runs_cron_time_idx
ON platform_scheduled_runs(cron,scheduled_for DESC);


-- V78 v1.21.54 — replay-safe idempotency ledger for selected high-impact API mutations.
CREATE TABLE IF NOT EXISTS api_idempotency(
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','completed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 100),
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  PRIMARY KEY(tenant_id,user_id,scope,idempotency_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS api_idempotency_created_idx
ON api_idempotency(created_at);

-- V80 governed agentic planning foundation (migration 045)
-- V80 Stage 1: governed agentic planning foundation.
-- This schema stores observations, recommendations and human decisions only.
-- It intentionally contains no executable side-effect queue.

CREATE TABLE IF NOT EXISTS agentic_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  generation_mode TEXT NOT NULL CHECK(generation_mode IN ('governed_ai_advisor','deterministic_fallback')),
  confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high')),
  observation_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agentic_runs_tenant_idx ON agentic_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agentic_proposals(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal>=1 AND ordinal<=8),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  risk TEXT NOT NULL CHECK(risk IN ('low','medium','high')),
  authority TEXT NOT NULL CHECK(authority IN ('recommendation_only','approval_required','human_only')),
  execution_policy TEXT NOT NULL CHECK(execution_policy IN ('not_executable_stage_1','prohibited_autonomy')),
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decided_by_user_id TEXT,
  decision_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,run_id,ordinal),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS agentic_proposals_tenant_idx ON agentic_proposals(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_proposals_run_idx ON agentic_proposals(tenant_id,run_id,ordinal);

CREATE TABLE IF NOT EXISTS agentic_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  proposal_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('PLAN_GENERATED','PROPOSAL_APPROVED','PROPOSAL_REJECTED')),
  actor_user_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(proposal_id) REFERENCES agentic_proposals(id) ON DELETE SET NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agentic_events_tenant_idx ON agentic_events(tenant_id,occurred_at DESC);

-- V80 Stage 2: governed agentic observation and outcome measurement.
-- Outcomes are human-recorded measurements of proposal results.
-- This schema intentionally adds no executable action queue or autonomous side-effect capability.

CREATE TABLE IF NOT EXISTS agentic_outcomes(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  outcome_status TEXT NOT NULL CHECK(outcome_status IN ('observed','improved','unchanged','worsened','resolved','not_applicable')),
  metric_key TEXT,
  baseline_json TEXT NOT NULL DEFAULT '{}',
  observed_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(proposal_id) REFERENCES agentic_proposals(id) ON DELETE CASCADE,
  FOREIGN KEY(recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agentic_outcomes_tenant_idx ON agentic_outcomes(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_outcomes_proposal_idx ON agentic_outcomes(tenant_id,proposal_id,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_outcomes_run_idx ON agentic_outcomes(tenant_id,run_id,created_at DESC);

-- v115: temporary manual bank-transfer subscription activation
CREATE TABLE IF NOT EXISTS manual_payment_submissions(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  bank_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','approved','rejected','cancelled')),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  rejection_reason TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_queue_idx ON manual_payment_submissions(status,submitted_at);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_tenant_idx ON manual_payment_submissions(tenant_id,submitted_at DESC);

CREATE TABLE IF NOT EXISTS manual_payment_events(
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(submission_id) REFERENCES manual_payment_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS manual_payment_events_submission_idx ON manual_payment_events(submission_id,created_at DESC);



-- V132: idempotent per-task Finance observation claims.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS agent_observation_claims (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 persistent_task_id TEXT NOT NULL,
 scheduled_for TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 1,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 checkpoint_id TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,persistent_task_id,scheduled_for),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(persistent_task_id) REFERENCES agent_persistent_tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(checkpoint_id) REFERENCES agent_observation_checkpoints(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_observation_claims_task_time ON agent_observation_claims(tenant_id,persistent_task_id,scheduled_for DESC);
CREATE TRIGGER IF NOT EXISTS trg_agent_observation_claim_tenant
BEFORE INSERT ON agent_observation_claims
FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM agent_persistent_tasks t WHERE t.id=NEW.persistent_task_id AND t.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'persistent_task_tenant_mismatch'); END;

