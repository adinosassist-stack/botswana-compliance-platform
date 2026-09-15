import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const wrapper=fs.readFileSync('scripts/production-synthetic-browser-wrapper.mjs','utf8');
const lifecycle=fs.readFileSync('scripts/production-synthetic-lifecycle.mjs','utf8');
const interruptionRecovery=fs.readFileSync('scripts/production-synthetic-interruption-recovery.mjs','utf8');
const components=fs.readFileSync('public/js/components.js','utf8');
const agenticEntry=fs.readFileSync('cloudflare/src/agentic-entry.js','utf8');
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
must(wrapper,/function apiTransport\(raw\)/,'browser proof classifies API transport without logging query data');
must(wrapper,/page\.on\('request',request=>/,'browser proof records safe API request-start breadcrumbs');
must(wrapper,/transport=\$\{apiTransport\(request\.url\(\)\)\}/,'request-start breadcrumb records only logical transport class');
must(wrapper,/type=\$\{type\}/,'response breadcrumb records bounded content type');
must(wrapper,/SYNTHETIC_BOOT_TRACE_PREFIX='THEBE_SYNTHETIC_BOOT '/,'browser proof accepts only the dedicated synthetic boot trace prefix');
must(wrapper,/page\.on\('console',message=>/,'browser proof captures synthetic-only boot stage markers');
must(wrapper,/page\.on\('crash',/,'browser proof records renderer crash separately from cleanup');
must(wrapper,/page\.on\('close',/,'browser proof records page close separately from cleanup');
must(wrapper,/browser\.on\('disconnected',/,'browser proof records browser disconnection with active stage');
must(wrapper,/clientMe=\$\{d\?\.clientMe\?\.ok\?`ok\/\$\{safe\(d\?\.clientMe\?\.role\|\|'role-missing'\)\}`/,'workspace diagnostic records the non-secret role returned by the client transport');
must(wrapper,/api breadcrumb/,'browser proof emits non-secret API stage breadcrumbs');
mustNot(wrapper,/api breadcrumb[^\n]*(email|password|cookie|csrf|token)/i,'API breadcrumbs do not log credentials or session secrets');
must(wrapper,/withDeadline\('browser close',[\s\S]*BROWSER_CLOSE_DEADLINE_MS\)/,'browser teardown is externally bounded');

syntax('cloudflare/src/agentic-entry.js','authenticated cold-start wrapper parses');
must(agenticEntry,/SYNTHETIC_BOOT_TRACE_PARAMS=new Set\(\["desktop-owner-proof","authenticated-mobile-proof"\]\)/,'edge boot tracing is restricted to the synthetic desktop/mobile proof query markers');
must(agenticEntry,/if\(url\.pathname!=="\/"\)return false/,'edge boot tracing is restricted to the root application document');
must(agenticEntry,/if\(!syntheticBootTraceRequested\(request\)\)return source/,'normal customer HTML bypasses synthetic boot tracing');
must(agenticEntry,/THEBE_SYNTHETIC_BOOT.*auth_me_start/,'synthetic trace marks authenticated-me request start');
must(agenticEntry,/THEBE_SYNTHETIC_BOOT.*auth_me_complete/,'synthetic trace marks authenticated-me resolution');
must(agenticEntry,/THEBE_SYNTHETIC_BOOT.*state_start/,'synthetic trace marks state request start');
must(agenticEntry,/THEBE_SYNTHETIC_BOOT.*state_complete/,'synthetic trace marks state resolution');
must(agenticEntry,/x-thebe-synthetic-boot-trace","auth-state-v1/,'synthetic traced documents carry an explicit non-secret diagnostic response marker');

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
must(interruptionRecovery,/e\.slice\(1\)\.join\(':'\)===c\.slice\(1\)\.join\(':'\)/,'stale recovery correlates run, attempt and nonce across email and company');
must(interruptionRecovery,/MAX_SYNTHETIC_COHORT=5/,'stale recovery retains an absolute five-account ceiling');
must(interruptionRecovery,/rawCandidates\.length<=MAX_SYNTHETIC_COHORT/,'stale recovery fails closed above the five-account ceiling');
must(interruptionRecovery,/EXPECTED_HISTORICAL_RUN_ATTEMPTS=new Set/,'five-account recovery is bound to the proven historical cohort');
must(interruptionRecovery,/raw\.role==='owner'&&raw\.status==='active'/,'stale recovery requires one active owner membership');
must(interruptionRecovery,/membershipCount===1&&tenantMembershipCount===1/,'stale recovery requires exact one-user one-tenant membership topology');
must(interruptionRecovery,/evidenceCount===0&&legalHoldCount===0/,'stale recovery refuses evidence or an active legal hold');
must(interruptionRecovery,/externalIdentityCount===0&&professionalProfileCount===0/,'stale recovery refuses external or professional identity data');
must(interruptionRecovery,/performanceSettings\.length===1/,'stale recovery requires exactly one system-created performance settings row');
must(interruptionRecovery,/partial historical cohort may resume only when every remaining candidate has a valid preexisting tombstone/,'partial cohort recovery is resume-only');
must(interruptionRecovery,/five-account recovery has mixed prepared\/unprepared tombstone state/,'five-account recovery refuses mixed preparation state');
must(interruptionRecovery,/all candidate tombstones prepared before first destructive deletion/,'full cohort tombstones are prepared before destructive deletion');
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