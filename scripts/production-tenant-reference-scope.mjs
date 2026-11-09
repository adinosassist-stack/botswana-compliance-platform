// Read-only production tenant-reference audit query builder.
// The public marketing funnel intentionally records pseudonymous conversion events
// under the non-customer sentinel "public-market", without a tenants row.
// Only its exact known, unauthenticated conversion records are exempt.
// All other dangling tenant references remain launch-blocking.
const IDENTIFIER=/^[A-Za-z0-9_]+$/;
const PUBLIC_MARKETING_EVENTS=Object.freeze([
  'MARKETING_MARKET_VIEW',
  'MARKETING_CTA_CLICK',
  'MARKETING_REGISTRATION_VIEW',
  'MARKETING_REGISTRATION_SUBMIT',
  'MARKETING_REGISTRATION_SUCCESS',
  'MARKETING_WORKSPACE_REACHED'
]);

export function buildDanglingTenantReferenceCountSql(table,column){
  if(!IDENTIFIER.test(table)||!IDENTIFIER.test(column))throw new Error('unsafe tenant dependency identifier');
  const query=`SELECT COUNT(*) AS count FROM ${table} r WHERE r.${column} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=r.${column})`;
  if(table!=='audit_events'||column!=='tenant_id')return query;
  const allowlist=PUBLIC_MARKETING_EVENTS.map(type=>`'${type}'`).join(',');
  return `${query} AND NOT (
    r.tenant_id='public-market' AND r.actor_user_id IS NULL
    AND r.entity_type='conversion'
    AND r.entity_id IS NOT NULL AND length(r.entity_id) BETWEEN 16 AND 64
    AND r.event_type IN (${allowlist})
  )`;
}

export {PUBLIC_MARKETING_EVENTS};
