-- V82: repair the explicit Thebe Desk platform-owner workspace boundary.
-- Security invariant: this migration never changes credentials or password hashes.
-- If the owner already has a workspace membership, the earliest membership is
-- repaired to active/owner. A dedicated owner workspace is created only when no
-- membership exists at all. Full access is granted by tenant entitlements rather
-- than by fabricating a customer payment.

INSERT OR IGNORE INTO tenants(id,name,created_at)
SELECT 'tenant_thebedesk_platform_owner','Thebe Desk',CURRENT_TIMESTAMP
WHERE EXISTS(
  SELECT 1 FROM users u WHERE lower(u.email)='thebedesk@gmail.com'
)
AND NOT EXISTS(
  SELECT 1
  FROM memberships m
  JOIN users u ON u.id=m.user_id
  WHERE lower(u.email)='thebedesk@gmail.com'
);

INSERT OR IGNORE INTO memberships(tenant_id,user_id,role,status)
SELECT 'tenant_thebedesk_platform_owner',u.id,'owner','active'
FROM users u
WHERE lower(u.email)='thebedesk@gmail.com'
  AND NOT EXISTS(
    SELECT 1 FROM memberships m WHERE m.user_id=u.id
  );

UPDATE memberships
SET role='owner',status='active'
WHERE user_id=(
    SELECT u.id FROM users u WHERE lower(u.email)='thebedesk@gmail.com' LIMIT 1
  )
  AND tenant_id=(
    SELECT m2.tenant_id
    FROM memberships m2
    JOIN tenants t2 ON t2.id=m2.tenant_id
    WHERE m2.user_id=(
      SELECT u2.id FROM users u2 WHERE lower(u2.email)='thebedesk@gmail.com' LIMIT 1
    )
    ORDER BY t2.created_at ASC,m2.tenant_id ASC
    LIMIT 1
  );

INSERT OR IGNORE INTO app_state(tenant_id,version,state_json,updated_at)
SELECT m.tenant_id,1,'{}',CURRENT_TIMESTAMP
FROM memberships m
JOIN users u ON u.id=m.user_id
JOIN tenants t ON t.id=m.tenant_id
WHERE lower(u.email)='thebedesk@gmail.com'
ORDER BY t.created_at ASC,m.tenant_id ASC
LIMIT 1;

INSERT OR REPLACE INTO entitlement_overrides(
  tenant_id,feature_key,enabled,limit_value,expires_at,reason,updated_at
)
SELECT canonical.tenant_id,features.feature_key,1,2147483647,NULL,
       'platform_owner_internal_full_access',CURRENT_TIMESTAMP
FROM (
  SELECT m.tenant_id
  FROM memberships m
  JOIN users u ON u.id=m.user_id
  JOIN tenants t ON t.id=m.tenant_id
  WHERE lower(u.email)='thebedesk@gmail.com'
    AND m.role='owner'
    AND m.status='active'
  ORDER BY t.created_at ASC,m.tenant_id ASC
  LIMIT 1
) canonical
CROSS JOIN (
  SELECT DISTINCT feature_key FROM plan_entitlements
) features;

INSERT OR IGNORE INTO ai_credit_wallets(
  tenant_id,balance,monthly_allowance,monthly_reset_at,lifetime_purchased,lifetime_used,updated_at
)
SELECT canonical.tenant_id,10000,10000,datetime('now','start of month','+1 month'),0,0,CURRENT_TIMESTAMP
FROM (
  SELECT m.tenant_id
  FROM memberships m
  JOIN users u ON u.id=m.user_id
  JOIN tenants t ON t.id=m.tenant_id
  WHERE lower(u.email)='thebedesk@gmail.com'
    AND m.role='owner'
    AND m.status='active'
  ORDER BY t.created_at ASC,m.tenant_id ASC
  LIMIT 1
) canonical;

UPDATE ai_credit_wallets
SET balance=MAX(balance,10000),
    monthly_allowance=MAX(monthly_allowance,10000),
    monthly_reset_at=COALESCE(monthly_reset_at,datetime('now','start of month','+1 month')),
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id=(
  SELECT m.tenant_id
  FROM memberships m
  JOIN users u ON u.id=m.user_id
  JOIN tenants t ON t.id=m.tenant_id
  WHERE lower(u.email)='thebedesk@gmail.com'
    AND m.role='owner'
    AND m.status='active'
  ORDER BY t.created_at ASC,m.tenant_id ASC
  LIMIT 1
);

INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data,occurred_at)
SELECT m.tenant_id,u.id,'platform_owner_access_repaired','user',u.id,
       '{"access":"internal_full","credential_changed":false}',CURRENT_TIMESTAMP
FROM memberships m
JOIN users u ON u.id=m.user_id
JOIN tenants t ON t.id=m.tenant_id
WHERE lower(u.email)='thebedesk@gmail.com'
  AND m.role='owner'
  AND m.status='active'
ORDER BY t.created_at ASC,m.tenant_id ASC
LIMIT 1;
