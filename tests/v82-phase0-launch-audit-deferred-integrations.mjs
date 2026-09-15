import fs from 'node:fs';

const audit=fs.readFileSync('scripts/production-launch-audit.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/production-launch-audit.yml','utf8');
const residueAudit=fs.readFileSync('scripts/production-synthetic-residue-audit.mjs','utf8');
let pass=0;
const ok=(condition,message)=>{
  if(!condition)throw new Error(`FAIL: ${message}`);
  pass++;
  console.log('PASS',message);
};

ok(audit.includes("function deferred(label,detail='')"), 'launch audit has an explicit deferred integration state');
ok(audit.includes('const anyConfigured=hasClient||hasRedirect||hasSecret'), 'OAuth audit distinguishes fully absent providers from partial configuration');
ok(audit.includes('if(!anyConfigured)')&&audit.includes('deferred OAuth start must fail closed with HTTP 503'), 'fully deferred OAuth must prove its runtime start endpoint fails closed');
ok(audit.includes("redirect!==cfg.callback")&&audit.includes('missing while provider is partially configured'), 'partially configured OAuth remains fail closed');
ok(audit.includes('if(!resendSecret&&!hasEmailFrom)')&&audit.includes("deferred('password-reset email'"), 'transactional email may be fully deferred');
ok(audit.includes('RESEND_API_KEY missing while transactional email is partially configured')&&audit.includes('EMAIL_FROM missing, malformed, or placeholder while transactional email is partially configured'), 'partial transactional email configuration remains a launch failure');
ok(audit.includes('LAUNCH_INTEGRATIONS_READY_OR_DEFERRED'), 'successful launch audit reports configured-or-deferred integration readiness');
ok(!audit.includes('LAUNCH_INTEGRATIONS_READY Google OAuth + Facebook OAuth + Resend sender configuration present'), 'launch audit no longer requires optional integrations unconditionally');
ok(workflow.includes('workflow_run:')&&workflow.includes('workflows: ["Thebe Desk Exact Post-Deploy Smoke"]'), 'privileged launch audit is automatically chained after exact post-deploy smoke');
ok(workflow.includes("github.event.workflow_run.conclusion == 'success'")&&workflow.includes("github.event.workflow_run.head_branch == 'main'"), 'automatic launch audit refuses failed or non-main smoke triggers');
ok(workflow.includes('AUDIT_SHA: ${{ github.event.workflow_run.head_sha }}')&&workflow.includes('ref: ${{ env.AUDIT_SHA }}'), 'launch audit binds checkout and authority to the exact deployed SHA');
ok(workflow.includes('post-deploy smoke SHA mismatch')&&workflow.includes('refusing stale launch audit')&&workflow.includes('refusing non-workflow_run launch audit trigger'), 'launch audit fails closed on trigger or current-main SHA drift');
ok(workflow.includes('environment: production')&&workflow.includes('CLOUDFLARE_API_TOKEN')&&workflow.includes('D1_DATABASE_ID'), 'privileged Cloudflare and D1 audit remains isolated in the production environment');
ok(!workflow.includes('\n  push:')&&!workflow.includes('[launch-audit]'), 'direct-push launch-audit production path is removed');
ok(audit.includes("import fs from 'node:fs'")&&audit.includes('MAX_LEGACY_ORPHAN_TENANTS=1'), 'launch audit records a bounded legacy orphan baseline without embedding tenant identifiers');
ok(audit.includes("const orphanPredicate=`NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=t.id)`"), 'tenant integrity audit defines ownership by membership');
ok(audit.includes("legacyAllowedDependencies=new Set(['memberships.tenant_id','subscriptions.tenant_id','audit_chain_state.tenant_id'])"), 'legacy orphan allowance is restricted to membership, subscription and audit-chain metadata');
ok(audit.includes("body.matchAll(/\\b([A-Za-z0-9_]*tenant_id)\\b/gi)")&&audit.includes('D1_DEPENDENCY_QUERY_CONCURRENCY=6')&&audit.includes('dependencyCounts[index]=await d1Scalar')&&audit.includes('await Promise.all(Array.from({length:dependencyConcurrency},()=>dependencyWorker()))')&&!audit.includes("batch.join(' UNION ALL ')")&&!audit.includes('D1_COMPOUND_SELECT_BATCH_SIZE'), 'tenant integrity audit derives the complete tenant-reference sweep with bounded independent D1 queries and no compound SELECT');
ok(audit.includes('assert(orphanUsers===0')&&audit.includes('assert(orphanTenants<=MAX_LEGACY_ORPHAN_TENANTS'), 'launch audit fails closed on orphan users or orphan tenant growth');
ok(audit.includes('assert(orphanSubscriptions===orphanTenants')&&audit.includes('assert(orphanAuditChainState===orphanTenants'), 'known legacy orphan residue must preserve the exact bounded metadata shape');
ok(audit.includes('assert(orphanBusinessDependencyRows===0')&&audit.includes("mark('tenant integrity baseline',true"), 'orphan-linked business data is forbidden and successful integrity state is explicit');
ok(audit.includes('LEGACY_DATA_DEBT orphan_tenants=')&&audit.includes('no automatic deletion performed'), 'legacy residue is reported without destructive production cleanup');

ok(residueAudit.includes('EXPECTED_HISTORICAL_COHORT=5')&&residueAudit.includes('candidates.length===0||candidates.length===EXPECTED_HISTORICAL_COHORT'), 'residue audit accepts only zero or the exact five-account historical cohort');
ok(residueAudit.includes('EMAIL_RE=/^synthetic\\.lifecycle')&&residueAudit.includes('COMPANY_RE=/^Thebe Desk Synthetic Lifecycle')&&residueAudit.includes("e.slice(1).join(':')===c.slice(1).join(':')"), 'residue audit correlates synthetic email and company run markers');
ok(residueAudit.includes('SELECT u.id AS user_id')&&residueAudit.includes('SELECT COUNT(*) AS count')&&residueAudit.includes('non-baseline tenant dependencies'), 'residue audit is limited to inspection queries and dependency reporting');
ok(residueAudit.includes('evidence===0&&legalHolds===0')&&residueAudit.includes('externalIdentities===0&&professionalProfiles===0')&&residueAudit.includes('locations<=1'), 'residue audit refuses protected, external-identity and expanded-location data');
ok(residueAudit.includes('BASELINE_DEPENDENCIES=new Set')&&residueAudit.includes("matchAll(/\\b([A-Za-z0-9_]*tenant_id)\\b/gi)")&&residueAudit.includes('non-baseline tenant dependencies'), 'residue audit derives and checks non-baseline tenant dependencies from schema');
ok(residueAudit.includes("'performance_alert_settings.tenant_id'")&&residueAudit.includes('function assertDefaultPerformanceSettings(row)')&&residueAudit.includes('performanceSettings.length===1')&&residueAudit.includes('candidate performance alert setting ${key} differs from system default')&&residueAudit.includes('notify_whatsapp:0')&&residueAudit.includes('coverage_drop_points:20')&&residueAudit.includes('metric_drop_percent:30')&&residueAudit.includes('improvement_percent:25')&&residueAudit.includes('incident_spike_count:2')&&residueAudit.includes('recurring_days:3')&&residueAudit.includes('min_baseline_days:3'), 'performance settings are baseline only when exactly one untouched system-default row exists');
ok(residueAudit.includes('QUERY_CONCURRENCY=6')&&residueAudit.includes('await Promise.all(Array.from'), 'residue audit bounds independent D1 dependency checks');

const productionAuditEnv=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','D1_DATABASE_ID'].every(name=>String(process.env[name]||'').trim());
if(productionAuditEnv){
  await import('../scripts/production-synthetic-residue-audit.mjs');
  console.log('PASS production-only historical synthetic residue audit completed');
}

console.log(`Phase 0 deferred integration, post-deploy, tenant-integrity and residue-audit contract: ${pass}/29 PASS`);
