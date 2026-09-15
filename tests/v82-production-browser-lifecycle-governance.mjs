import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const wrapper=fs.readFileSync('scripts/production-synthetic-browser-wrapper.mjs','utf8');
const lifecycle=fs.readFileSync('scripts/production-synthetic-lifecycle.mjs','utf8');
const interruptionRecovery=fs.readFileSync('scripts/production-synthetic-interruption-recovery.mjs','utf8');
const components=fs.readFileSync('public/js/components.js','utf8');
const launch=fs.readFileSync('.github/workflows/production-launch-audit.yml','utf8');
const recovery=fs.readFileSync('.github/workflows/recovery-ci.yml','utf8');

function must(source,pattern,label){if(!pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}
function mustNot(source,pattern,label){if(pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}
function syntax(path,label){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status!==0)throw new Error(`FAIL ${label}: ${r.stderr||r.stdout}`);console.log(`PASS ${label}`)}

must(wrapper,/await import\('\.\/production-synthetic-lifecycle\.mjs'\)/,'browser proof delegates canonical mutation and cleanup authority');
mustNot(wrapper,/globalThis\.fetch\s*=/,'browser wrapper does not intercept canonical lifecycle fetch or cleanup control');
must(wrapper,/globalThis\.__thebeSyntheticBrowserProof=async credentials/,'browser proof is exposed as an explicit lifecycle hook');
must(wrapper,/delete globalThis\.__thebeSyntheticBrowserProof/,'browser proof hook is removed after lifecycle execution');
must(wrapper,/\/api\/auth\/login/,'browser proof independently authenticates the canonical owner');
must(wrapper,/register-direct\.html/,'desktop pass exercises the live direct-registration route');
must(wrapper,/registration-proof\/challenge/,'desktop pass exercises first-party registration protection');
must(wrapper,/desktop registration pass 1/,'desktop pass 1 is explicitly reported');
must(wrapper,/desktop registration pass 2/,'desktop pass 2 is explicitly reported');
must(wrapper,/desktop registration pass 3/,'desktop pass 3 is explicitly reported');
must(wrapper,/appShell/,'authenticated desktop proof requires the real application shell');
must(wrapper,/workspaceSidebar/,'authenticated browser proof requires the real workspace sidebar');
must(wrapper,/mobileMenuButton/,'same synthetic owner continues into the real mobile menu');
must(wrapper,/bodyTouch!=='none'/,'mobile continuation rejects the touch-freeze regression');
must(wrapper,/\[data-view\]:visible/,'desktop and mobile proof exercise a real workspace navigation target');
mustNot(wrapper,/DELETE FROM|deletion_tombstones|Cloudflare API/,'browser wrapper does not duplicate destructive cleanup or D1 authority');

must(wrapper,/function withDeadline\(label,promise,ms\)/,'browser proof has a Node-side external stage deadline');
must(wrapper,/withDeadline\('desktop authenticated reload',[\s\S]*RELOAD_EXTERNAL_DEADLINE_MS\)/,'desktop authenticated reload is externally bounded');
must(wrapper,/withDeadline\('mobile authenticated reload',[\s\S]*RELOAD_EXTERNAL_DEADLINE_MS\)/,'mobile authenticated reload is externally bounded');
must(wrapper,/withDeadline\('desktop post-reload diagnostic',[\s\S]*DIAGNOSTIC_EXTERNAL_DEADLINE_MS\)/,'desktop post-reload diagnostics are externally bounded');
must(wrapper,/withDeadline\('desktop workspace reveal',[\s\S]*WORKSPACE_EXTERNAL_DEADLINE_MS\)/,'desktop workspace reveal is externally bounded');
must(wrapper,/API_BREADCRUMB_PATHS=new Set\(\['\/api\/auth\/me','\/api\/state','\/api\/audit','\/api\/billing\/status'\]\)/,'browser proof records only bounded startup API breadcrumbs');
must(wrapper,/function logicalApiPath\(raw\)/,'browser proof normalizes direct, tunnel and shadow API routes for diagnostics');
must(wrapper,/api breadcrumb/,'browser proof emits non-secret API stage breadcrumbs');
mustNot(wrapper,/api breadcrumb[^\n]*(email|password|cookie|csrf|token)/i,'API breadcrumbs do not log credentials or session secrets');
must(wrapper,/withDeadline\('browser close',[\s\S]*BROWSER_CLOSE_DEADLINE_MS\)/,'browser teardown is externally bounded');

must(lifecycle,/const browserProof=globalThis\.__thebeSyntheticBrowserProof/,'canonical lifecycle discovers the browser proof hook');
must(lifecycle,/await browserProof\(Object\.freeze\(\{email,password,companyName\}\)\)/,'canonical lifecycle supplies only its generated synthetic identity to browser proof');
const loginIndex=lifecycle.indexOf("mark('live login'");
const browserIndex=lifecycle.indexOf('const browserProof=globalThis.__thebeSyntheticBrowserProof');
const deletionIndex=lifecycle.indexOf("const deletion=await publicJson('/api/account/deletion-request'");
assert.ok(loginIndex>=0&&browserIndex>loginIndex&&deletionIndex>browserIndex,'browser proof must run after canonical login and before deletion/cleanup');
console.log('PASS browser proof remains inside canonical failure-cleanup boundary');
must(lifecycle,/guardedCleanup\('failure recovery'\)/,'canonical failure path retains guarded cleanup');
must(lifecycle,/production synthetic lifecycle closure/,'canonical success path retains full lifecycle closure');

syntax('scripts/production-synthetic-interruption-recovery.mjs','interrupted synthetic recovery script parses');
must(interruptionRecovery,/EMAIL_RE=\/\^synthetic\\\.lifecycle\\\.\(\\d\+\)\\\.\(\\d\+\)\\\.\(\[0-9a-f\]\{12\}\)@example\\\.invalid\$\//,'stale recovery requires the exact synthetic email marker');
must(interruptionRecovery,/COMPANY_RE=\/\^Thebe Desk Synthetic Lifecycle \(\\d\+\)-\(\\d\+\)-\(\[0-9a-f\]\{12\}\)\$\//,'stale recovery requires the exact synthetic company marker');
must(interruptionRecovery,/emailMarker===companyMarker/,'stale recovery correlates run, attempt and nonce across email and company');
must(interruptionRecovery,/MAX_STALE_SYNTHETIC=1/,'stale recovery is capped at one interrupted synthetic account');
must(interruptionRecovery,/candidates\.length<=MAX_STALE_SYNTHETIC/,'stale recovery fails closed above the one-account cap');
must(interruptionRecovery,/candidate\.role==='owner'&&candidate\.status==='active'/,'stale recovery requires one active owner membership');
must(interruptionRecovery,/membershipCount===1&&tenantMembershipCount===1/,'stale recovery requires exact one-user one-tenant membership topology');
must(interruptionRecovery,/evidenceCount===0/,'stale recovery refuses synthetic tenants containing evidence');
must(interruptionRecovery,/legalHoldCount===0/,'stale recovery refuses an active legal hold');
must(interruptionRecovery,/DELETE FROM tenants WHERE id=\?/,'stale recovery deletes only the exact correlated synthetic tenant id');
must(interruptionRecovery,/DELETE FROM users WHERE id=\? AND NOT EXISTS/,'stale recovery deletes only the exact correlated synthetic user id after membership removal');
mustNot(interruptionRecovery,/DELETE FROM users WHERE email LIKE|DELETE FROM tenants WHERE name LIKE/,'stale recovery never performs pattern-based customer deletion');

must(components,/WORKSPACE_ENTRY_BILLING_BUDGET_MS=5000/,'workspace entry gives optional billing a bounded five-second budget');
must(components,/shell\.style\.visibility==="hidden"/,'billing budget applies only before workspace visibility');
must(components,/url\.pathname==="\/api\/billing\/status"/,'billing budget recognizes direct billing status route');
must(components,/url\.pathname==="\/__thebe_api\/billing\/status"/,'billing budget recognizes shadow billing status route');
must(components,/url\.searchParams\.get\("__thebe_api_path"\)==="\/api\/billing\/status"/,'billing budget recognizes root-tunnel billing status route');
must(components,/billing_status_deferred/,'billing budget fails the optional request explicitly rather than hanging workspace entry');
must(components,/status:408/,'billing budget returns a bounded non-success response for loadBilling to absorb');

must(launch,/playwright-core@1\.55\.0/,'production launch audit pins the browser driver');
must(launch,/node scripts\/production-synthetic-interruption-recovery\.mjs/,'production launch audit recovers strictly bounded interrupted synthetic residue before creating another account');
must(launch,/node scripts\/production-synthetic-browser-wrapper\.mjs/,'production launch audit runs browser wrapper');
must(launch,/\[synthetic-lifecycle\]/,'browser lifecycle stays behind the explicit production marker');
must(launch,/node scripts\/production-zero-orphan-audit\.mjs/,'permanent zero-orphan audit remains in the production chain');
const workflowRecoveryIndex=launch.indexOf('node scripts/production-synthetic-interruption-recovery.mjs');
const workflowBrowserIndex=launch.indexOf('node scripts/production-synthetic-browser-wrapper.mjs');
const orphanIndex=launch.indexOf('node scripts/production-zero-orphan-audit.mjs');
if(workflowRecoveryIndex<0||workflowBrowserIndex<0||workflowRecoveryIndex>=workflowBrowserIndex)throw new Error('FAIL interrupted synthetic recovery must run before a new browser lifecycle');
console.log('PASS interrupted synthetic recovery precedes new browser lifecycle');
if(workflowBrowserIndex<0||orphanIndex<0||workflowBrowserIndex>=orphanIndex)throw new Error('FAIL zero-orphan audit must run after browser lifecycle cleanup');
console.log('PASS zero-orphan audit follows browser lifecycle cleanup');

must(recovery,/node --check scripts\/production-synthetic-browser-wrapper\.mjs/,'Recovery CI syntax-checks the browser wrapper');
must(recovery,/node tests\/v82-production-browser-lifecycle-governance\.mjs/,'Recovery CI enforces browser lifecycle governance');

console.log('Production browser lifecycle governance: PASS');
