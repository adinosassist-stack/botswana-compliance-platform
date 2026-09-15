import fs from 'node:fs';

const wrapper=fs.readFileSync('scripts/production-synthetic-browser-wrapper.mjs','utf8');
const launch=fs.readFileSync('.github/workflows/production-launch-audit.yml','utf8');
const recovery=fs.readFileSync('.github/workflows/recovery-ci.yml','utf8');

function must(source,pattern,label){if(!pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}
function mustNot(source,pattern,label){if(pattern.test(source))throw new Error(`FAIL ${label}`);console.log(`PASS ${label}`)}

must(wrapper,/await import\('\.\/production-synthetic-lifecycle\.mjs'\)/,'browser proof delegates canonical mutation and cleanup authority');
must(wrapper,/\/api\/auth\/register/,'wrapper captures the canonical registration identity');
must(wrapper,/\/api\/auth\/login/,'wrapper binds browser proof to successful owner login');
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

must(launch,/playwright-core@1\.55\.0/,'production launch audit pins the browser driver');
must(launch,/node scripts\/production-synthetic-browser-wrapper\.mjs/,'production launch audit runs browser wrapper');
must(launch,/\[synthetic-lifecycle\]/,'browser lifecycle stays behind the explicit production marker');
must(launch,/node scripts\/production-zero-orphan-audit\.mjs/,'permanent zero-orphan audit remains in the production chain');
const browserIndex=launch.indexOf('node scripts/production-synthetic-browser-wrapper.mjs');
const orphanIndex=launch.indexOf('node scripts/production-zero-orphan-audit.mjs');
if(browserIndex<0||orphanIndex<0||browserIndex>=orphanIndex)throw new Error('FAIL zero-orphan audit must run after browser lifecycle cleanup');
console.log('PASS zero-orphan audit follows browser lifecycle cleanup');

must(recovery,/node --check scripts\/production-synthetic-browser-wrapper\.mjs/,'Recovery CI syntax-checks the browser wrapper');
must(recovery,/node tests\/v82-production-browser-lifecycle-governance\.mjs/,'Recovery CI enforces browser lifecycle governance');

console.log('Production browser lifecycle governance: PASS');
