-- v75: Botswana market fit, sustainable pricing entitlements and support boundaries.
PRAGMA foreign_keys = ON;

-- Revised plan entitlements. Limits are server-side controls, not marketing-only labels.
INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','core_compliance',1,NULL),('starter','tenderready',0,0),('starter','employer_shield',0,0),('starter','company_secretary',0,0),('starter','licenceos',1,20),('starter','compliance_passport',0,0),('starter','partner_portal',0,0),('starter','professional_services',1,NULL),('starter','ai_monthly_credits',1,0),('starter','daily_operations',0,0),('starter','operating_locations',1,1),('starter','bw_tax_transition',1,NULL),('starter','cipa_survival',1,NULL),('starter','procurement_transition',1,NULL),
 ('business','core_compliance',1,NULL),('business','tenderready',1,30),('business','employer_shield',1,50),('business','company_secretary',1,NULL),('business','licenceos',1,60),('business','compliance_passport',1,NULL),('business','partner_portal',0,0),('business','professional_services',1,NULL),('business','ai_monthly_credits',1,40),('business','daily_operations',1,1),('business','operating_locations',1,2),('business','bw_tax_transition',1,NULL),('business','cipa_survival',1,NULL),('business','procurement_transition',1,NULL),
 ('pro','core_compliance',1,NULL),('pro','tenderready',1,150),('pro','employer_shield',1,250),('pro','company_secretary',1,NULL),('pro','licenceos',1,300),('pro','compliance_passport',1,NULL),('pro','partner_portal',0,0),('pro','professional_services',1,NULL),('pro','ai_monthly_credits',1,150),('pro','daily_operations',1,1),('pro','operating_locations',1,10),('pro','bw_tax_transition',1,NULL),('pro','cipa_survival',1,NULL),('pro','procurement_transition',1,NULL),
 ('network','core_compliance',1,NULL),('network','tenderready',1,500),('network','employer_shield',1,500),('network','company_secretary',1,NULL),('network','licenceos',1,1000),('network','compliance_passport',1,NULL),('network','partner_portal',1,5),('network','professional_services',1,NULL),('network','ai_monthly_credits',1,350),('network','daily_operations',1,1),('network','operating_locations',1,25),('network','bw_tax_transition',1,NULL),('network','cipa_survival',1,NULL),('network','procurement_transition',1,NULL),
 ('partner','core_compliance',1,NULL),('partner','tenderready',1,1000),('partner','employer_shield',1,2000),('partner','company_secretary',1,NULL),('partner','licenceos',1,2000),('partner','compliance_passport',1,NULL),('partner','partner_portal',1,20),('partner','professional_services',1,NULL),('partner','ai_monthly_credits',1,500),('partner','daily_operations',1,1),('partner','operating_locations',1,100),('partner','bw_tax_transition',1,NULL),('partner','cipa_survival',1,NULL),('partner','procurement_transition',1,NULL);

UPDATE ai_credit_packs SET price_bwp=59 WHERE sku='AI50';
UPDATE ai_credit_packs SET price_bwp=149 WHERE sku='AI150';
UPDATE ai_credit_packs SET price_bwp=399 WHERE sku='AI500';

UPDATE service_catalog SET base_price_bwp=750 WHERE sku='TENDER_REVIEW';
UPDATE service_catalog SET base_price_bwp=1800 WHERE sku='TENDER_PACK';
UPDATE service_catalog SET base_price_bwp=1250 WHERE sku='HR_CASE_REVIEW';
UPDATE service_catalog SET base_price_bwp=650 WHERE sku='COMPANY_CHANGE';
UPDATE service_catalog SET base_price_bwp=2500 WHERE sku='COMPLIANCE_AUDIT';
UPDATE service_catalog SET base_price_bwp=950 WHERE sku='LICENCE_ASSIST';
INSERT OR IGNORE INTO service_catalog(sku,name,category,description,base_price_bwp,active,requires_professional,sort_order)
VALUES('ASSISTED_SETUP','Assisted Workspace Setup','onboarding','Guided configuration, evidence checklist and first compliance profile review.',499,1,0,70);
