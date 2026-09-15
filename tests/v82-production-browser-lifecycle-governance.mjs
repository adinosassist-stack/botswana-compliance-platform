import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrapper=fs.readFileSync('scripts/production-synthetic-browser-wrapper.mjs','utf8');
const lifecycle=fs.readFileSync('scripts/production-synthetic-lifecycle.mjs','utf8');
const components=fs.readFileSync('public/js/components.js','utf8');
const launch=fs.readFileSync('.github/workflows/production-launch-audit.yml','utf8');
const recovery=fs.readFileSync('.github/workflows/recovery-ci.yml','utf8');

function must(source,pattern,label){if(!pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}
function mustNot(source,pattern,label){if(pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}

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

must(lifecycle,/const browserProof=globalThis\.__thebeSyntheticBrowserProof/,'canonical lifecycle discovers the browser proof hook');
must(lifecycle,/await browserProof\(Object\.freeze\(\{email,password,companyName\}\)\)/,'canonical lifecycle supplies only its generated synthetic identity to browser proof');
const loginIndex=lifecycle.indexOf("mark('live login'");
const browserIndex=lifecycle.indexOf('const browserProof=globalThis.__thebeSyntheticBrowserProof');
const deletionIndex=lifecycle.indexOf("const deletion=await publicJson('/api/account/deletion-request'");
assert.ok(loginIndex>=0&&browserIndex>loginIndex&&deletionIndex>browserIndex,'browser proof must run after canonical login and before deletion/cleanup');
console.log('PASS browser proof remains inside canonical failure-cleanup boundary');
must(lifecycle,/guardedCleanup\('failure recovery'\)/,'canonical failure path retains guarded cleanup');
must(lifecycle,/production synthetic lifecycle closure/,'canonical success path retains full lifecycle closure');

must(components,/WORKSPACE_ENTRY_BILLING_BUDGET_MS=5000/,'workspace entry gives optional billing a bounded five-second budget');
must(components,/shell\.style\.visibility==="hidden"/,'billing budget applies only before workspace visibility');
must(components,/url\.pathname==="\/api\/billing\/status"/,'billing budget recognizes direct billing status route');
must(components,/url\.pathname==="\/__thebe_api\/billing\/status"/,'billing budget recognizes shadow billing status route');
must(components,/url\.searchParams\.get\("__thebe_api_path"\)==="\/api\/billing\/status"/,'billing budget recognizes root-tunnel billing status route');
must(components,/billing_status_deferred/,'billing budget fails the optional request explicitly rather than hanging workspace entry');
must(components,/status:408/,'billing budget returns a bounded non-success response for loadBilling to absorb');

must(launch,/playwright-core@1\.55\.0/,'production launch audit pins the browser driver');
must(launch,/node scripts\/production-synthetic-browser-wrapper\.mjs/,'production launch audit runs browser wrapper');
must(launch,/\[synthetic-lifecycle\]/,'browser lifecycle stays behind the explicit production marker');
must(launch,/node scripts\/production-zero-orphan-audit\.mjs/,'permanent zero-orphan audit remains in the production chain');
const workflowBrowserIndex=launch.indexOf('node scripts/production-synthetic-browser-wrapper.mjs');
const orphanIndex=launch.indexOf('node scripts/production-zero-orphan-audit.mjs');
if(workflowBrowserIndex<0||orphanIndex<0||workflowBrowserIndex>=orphanIndex)throw new Error('FAIL zero-orphan audit must run after browser lifecycle cleanup');
console.log('PASS zero-orphan audit follows browser lifecycle cleanup');

must(recovery,/node --check scripts\/production-synthetic-browser-wrapper\.mjs/,'Recovery CI syntax-checks the browser wrapper');
must(recovery,/node tests\/v82-production-browser-lifecycle-governance\.mjs/,'Recovery CI enforces browser lifecycle governance');

console.log('Production browser lifecycle governance: PASS');
