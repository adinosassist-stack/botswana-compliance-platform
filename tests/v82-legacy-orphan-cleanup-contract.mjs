import fs from 'node:fs';

const cleanup=fs.readFileSync('scripts/production-legacy-orphan-cleanup.mjs','utf8');
const zeroAudit=fs.readFileSync('scripts/production-zero-orphan-audit.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/production-launch-audit.yml','utf8');
let pass=0;
const ok=(condition,message)=>{if(!condition)throw new Error(`FAIL: ${message}`);pass++;console.log('PASS',message)};

ok(workflow.includes('workflows: ["Thebe Desk Exact Post-Deploy Smoke"]')&&workflow.includes("github.event.workflow_run.conclusion == 'success'")&&workflow.includes("github.event.workflow_run.head_branch == 'main'"),'cleanup remains inside the authoritative successful-main post-deploy launch audit');
ok(workflow.includes('AUDIT_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}')&&workflow.includes('ref: ${{ env.AUDIT_SHA }}')&&workflow.includes('refusing stale launch audit target'),'launch audit binds cleanup authority to exact current main SHA');
ok(workflow.includes("grep -Fq '[legacy-orphan-cleanup]'")&&workflow.includes('Legacy orphan cleanup marker absent; keeping this step read-only.'),'destructive cleanup is one-shot marker gated');
ok(workflow.includes('AUDIT_INTEGRITY_SECRET: ${{ secrets.AUDIT_INTEGRITY_SECRET }}')&&workflow.includes('node scripts/production-legacy-orphan-cleanup.mjs'),'cleanup secret is isolated to the destructive step');
ok(workflow.indexOf('node scripts/production-launch-audit.mjs')<workflow.indexOf('node scripts/production-legacy-orphan-cleanup.mjs')&&workflow.indexOf('node scripts/production-legacy-orphan-cleanup.mjs')<workflow.indexOf('node scripts/production-zero-orphan-audit.mjs'),'read-only launch audit precedes optional cleanup and permanent zero-orphan verification');

ok(cleanup.includes("Date.parse('2026-09-14T10:33:32Z')")&&cleanup.includes('createdAt<=BASELINE_OBSERVED_AT'),'cleanup refuses any orphan newer than the recorded pre-fix baseline');
ok(cleanup.includes('expected exactly one bounded legacy orphan')&&cleanup.includes('orphan unexpectedly has memberships'),'cleanup requires exactly one unowned legacy tenant');
ok(cleanup.includes('external billing identifiers')&&cleanup.includes("SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=?")&&cleanup.includes('legacy orphan retains backing audit events; refusing cleanup'),'cleanup refuses billing-linked residue or any backing audit events');
ok(cleanup.includes('Number.isSafeInteger(eventCount)&&eventCount>=0')&&cleanup.includes("/^[0-9a-f]{64}$/i.test(lastHash)")&&cleanup.includes('zero-count legacy audit-chain metadata is inconsistent'),'cleanup only accepts structurally coherent stale audit-chain metadata');
ok(cleanup.includes("allowedResidue=new Set(['memberships.tenant_id','subscriptions.tenant_id','audit_chain_state.tenant_id'])")&&cleanup.includes('legacy orphan retains non-baseline tenant-linked rows'),'cleanup derives and rejects non-baseline tenant dependencies');
ok(cleanup.includes("update(`tenant-deletion|${tenantId}`)")&&cleanup.includes("String(tombstone.purge_version)==='legacy-orphan-v1'")&&cleanup.includes("VALUES(?,?,'legacy-orphan-v1',0,0,0,CURRENT_TIMESTAMP)"),'cleanup retains only a non-PII HMAC tombstone');
ok(cleanup.includes("DELETE FROM subscriptions WHERE tenant_id=?")&&cleanup.includes("DELETE FROM audit_chain_state WHERE tenant_id=?")&&cleanup.includes("DELETE FROM tenants WHERE id=? AND NOT EXISTS"),'cleanup mutation scope is restricted to bounded residue and the orphan tenant');
ok(cleanup.includes("orphan tenant baseline is not zero after cleanup")&&cleanup.includes('afterTenants===beforeTenants-1'),'cleanup verifies exactly one tenant was removed and zero orphans remain');

ok(zeroAudit.includes("assert(/^SELECT\\b/i.test(statement)")&&zeroAudit.includes('refusing non-read-only D1 query'),'permanent zero-orphan audit is read-only');
ok(zeroAudit.includes('assert(orphanTenants===0')&&zeroAudit.includes('assert(orphanUsers===0'),'permanent baseline rejects orphan tenants and orphan users');
ok(zeroAudit.includes('dangling tenant-reference rows detected')&&zeroAudit.includes('body.matchAll(/\\b([A-Za-z0-9_]*tenant_id)\\b/gi)'),'permanent baseline dynamically rejects dangling tenant references');

console.log(`Legacy orphan cleanup and zero-baseline contract: ${pass}/16 PASS`);
