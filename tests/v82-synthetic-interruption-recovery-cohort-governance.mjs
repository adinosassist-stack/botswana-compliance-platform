import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const recoveryPath='scripts/production-synthetic-interruption-recovery.mjs';
const recovery=fs.readFileSync(recoveryPath,'utf8');
let pass=0;
const ok=(condition,message)=>{
  if(!condition)throw new Error(`FAIL: ${message}`);
  pass++;
  console.log('PASS',message);
};

const syntax=spawnSync(process.execPath,['--check',recoveryPath],{encoding:'utf8'});
ok(syntax.status===0,`synthetic interruption recovery parses cleanly${syntax.stderr?`: ${syntax.stderr.trim()}`:''}`);
ok(recovery.includes("const MAX_SYNTHETIC_COHORT=5")&&recovery.includes("EXPECTED_HISTORICAL_RUN_ATTEMPTS=new Set")&&recovery.includes("'34972933934:1'")&&recovery.includes("'34972933934:2'")&&recovery.includes("'34980328632:1'")&&recovery.includes("'34995082365:1'")&&recovery.includes("'34997904456:1'"), 'five-account authority is bound to the exact proven historical run/attempt cohort');
ok(recovery.includes("EMAIL_RE=/^synthetic\\.lifecycle\\.(\\d+)\\.(\\d+)\\.([0-9a-f]{12})@example\\.invalid$/")&&recovery.includes("COMPANY_RE=/^Thebe Desk Synthetic Lifecycle (\\d+)-(\\d+)-([0-9a-f]{12})$/"), 'strict synthetic marker patterns are not broadened');
ok(recovery.includes("'performance_alert_settings.tenant_id'")&&recovery.includes('function assertDefaultPerformanceSettings(row)')&&recovery.includes('performanceSettings.length===1')&&recovery.includes('candidate performance alert setting ${key} differs from system default')&&recovery.includes('notify_whatsapp:0')&&recovery.includes('coverage_drop_points:20')&&recovery.includes('metric_drop_percent:30')&&recovery.includes('improvement_percent:25')&&recovery.includes('incident_spike_count:2')&&recovery.includes('recurring_days:3')&&recovery.includes('min_baseline_days:3'), 'system performance settings are baseline only when exactly one untouched default row exists');
ok(recovery.includes("BASELINE_DEPENDENCIES=new Set")&&recovery.includes("matchAll(/\\b([A-Za-z0-9_]*tenant_id)\\b/gi)")&&recovery.includes('QUERY_CONCURRENCY=6')&&recovery.includes('synthetic recovery cohort contains non-baseline tenant dependencies'), 'cohort recovery derives and checks non-baseline tenant dependencies from schema');
ok(recovery.includes('evidenceCount===0&&legalHoldCount===0')&&recovery.includes('externalIdentityCount===0&&professionalProfileCount===0')&&recovery.includes('locationCount<=1')&&recovery.includes('subscriptionCount===1'), 'cohort preflight refuses protected, external-identity, expanded-location and non-registration topology');
ok(recovery.includes("prepared.length===0||prepared.length===n")&&recovery.includes('five-account recovery has mixed prepared/unprepared tombstone state'), 'five-account cleanup refuses mixed tombstone preparation state');
ok(recovery.includes("n>=2&&n<MAX_SYNTHETIC_COHORT")&&recovery.includes('partial historical cohort may resume only when every remaining candidate has a valid preexisting tombstone'), 'two-to-four account cleanup is resume-only with valid preexisting tombstones');
ok(recovery.includes("assert(n===1,'unexpected synthetic cohort size')")&&recovery.includes("prepared.length===1?'resume_single':'prepare_single'"), 'single interrupted synthetic cleanup remains independently recoverable');
ok(recovery.includes("createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`)")&&recovery.includes("SELECT request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged FROM deletion_tombstones WHERE tenant_fingerprint=?")&&recovery.includes("prepared tombstone has no matching recoverable deletion request"), 'resume authority requires the existing HMAC tombstone and matching recoverable deletion request');
ok(recovery.includes("INSERT INTO deletion_requests")&&recovery.includes("INSERT INTO deletion_tombstones")&&recovery.includes("all candidate tombstones prepared before first destructive deletion"), 'initial cohort preparation persists requests and all tombstones before destructive deletion');
const preflightIndex=recovery.indexOf('const candidates=[];for(const raw of rawCandidates)candidates.push(await preflightCandidate(raw));');
const dependencyIndex=recovery.indexOf('await assertCohortDependencies(candidates);');
const authorizationIndex=recovery.indexOf('const authorization=assertCohortAuthorization(candidates);');
const preparationIndex=recovery.indexOf("if(authorization.mode==='prepare_historical'||authorization.mode==='prepare_single')");
const deleteIndex=recovery.indexOf('for(const candidate of candidates)await purgeCandidate(candidate);');
ok(preflightIndex>=0&&dependencyIndex>preflightIndex&&authorizationIndex>dependencyIndex&&preparationIndex>authorizationIndex&&deleteIndex>preparationIndex, 'full cohort preflight, dependency proof, authorization and preparation all precede deletion');
ok(recovery.includes('for(const candidate of candidates)await assertStillPrepared(candidate);')&&recovery.includes("prepared synthetic candidate identity changed before deletion")&&recovery.includes("prepared synthetic tombstone disappeared before deletion"), 'prepared identities and tombstones are revalidated immediately before purge');
ok(recovery.includes("rawCandidates.length<=MAX_SYNTHETIC_COHORT")&&recovery.includes('refusing recovery above cap ${MAX_SYNTHETIC_COHORT}'), 'recovery remains absolutely capped at five candidates');
ok(recovery.includes("assert(leftovers===0")&&recovery.includes("assert(orphanUsers===0")&&recovery.includes("SYNTHETIC_INTERRUPTION_RECOVERY_PASS"), 'recovery requires zero strict synthetic residue and zero orphan users at closure');
ok(!recovery.includes('[legacy-orphan-cleanup]')&&!recovery.includes('legacy-orphan-cleanup'), 'synthetic recovery does not acquire legacy orphan cleanup authority');

console.log(`Synthetic interruption recovery cohort governance: ${pass}/16 PASS`);
