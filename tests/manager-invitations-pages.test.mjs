import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('manager onboarding pages only served through explicit staging gate',()=>{
 const w=read('cloudflare/src/worker.js');
 const i=w.indexOf("if(url.pathname.startsWith('/manager-invite/'))");
 assert.ok(i>=0);
 const block=w.slice(i,i+1600);
 assert.match(block,/APP_ENV/);assert.match(block,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
 assert.match(block,/return json\(\{error:'not_found'\},404\)/);
 assert.match(block,/manager-invite\/owner/);assert.match(block,/manager-invite\/activate/);
});
test('owner invitation page uses authenticated session and CSRF and fragment-only link',()=>{
 const s=read('public/js/manager-invite-owner-entry.js');
 assert.match(s,/api\/auth\/me/);assert.match(s,/session\?\.user\?\.role!=='owner'/);
 assert.match(s,/getCsrfToken:.*sessionCsrf/);assert.match(s,/sessionCsrf=session.csrfToken/);assert.match(s,/#token=/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|location\.search/);
});
test('activation page strips fragment before posting token',()=>{
 const s=read('public/js/manager-invite-activate.js');
 assert.match(s,/location\.hash/);assert.match(s,/history\.replaceState/);
 assert.match(s,/manager-invite\/accept/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|location\.search/);
});


test('restricted manager dashboard avoids workspace-wide endpoints and requires manager authentication',()=>{
 const w=read('cloudflare/src/worker.js');
 const pageGate=w.slice(w.indexOf("if(url.pathname.startsWith('/manager-invite/'))"),w.indexOf("if(url.pathname.startsWith('/manager-invite/'))")+1400);
 assert.match(pageGate,/manager-invite\/dashboard/);
 const html=read('public/manager-invite/dashboard/index.html');
 assert.match(html,/manager-invite-dashboard\.js/);
 const js=read('public/js/manager-invite-dashboard.js');
 assert.match(js,/session\?\.user\?\.role!=='manager'/);
 assert.match(js,/my-dashboard/);assert.match(js,/my-reports/);
 assert.doesNotMatch(js,/fetch\(['"]\/api\/state/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
});
test('activation page points to the existing sign-in route after successful claim',()=>{
 const s=read('public/js/manager-invite-activate.js');
 assert.match(s,/link\.href='\/auth\/'/);
 assert.match(s,/form\.hidden=true/);
});


test('invited managers receive a restricted landing only in staging and only from accepted tenant invite',()=>{
 const worker=read('cloudflare/src/worker.js');
 const start=worker.indexOf('if(url.pathname==="/api/auth/login"');
 const end=worker.indexOf('if(url.pathname==="/api/auth/password-reset/request"',start);
 const login=worker.slice(start,end);
 assert.match(login,/APP_ENV/);
 assert.match(login,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
 assert.match(login,/selected\.role==='manager'/);
 assert.match(login,/accepted_by_user_id=\?/);
 assert.match(login,/tenant_id=\?/);
 assert.match(login,/status='accepted'/);
 assert.match(login,/landingPath:managerLandingPath/);
 const me=worker.slice(worker.indexOf('if(url.pathname==="/api/auth/me"'),worker.indexOf('if(url.pathname==="/api/auth/me"')+1000);
 assert.match(me,/managerInviteStage/);assert.match(me,/accepted_by_user_id=\?/);
});
test('auth portal routes invited managers only to the exact server-issued restricted path',()=>{
 const client=read('public/js/auth-portal.js');
 assert.match(client,/data\?\.landingPath==="\/manager-invite\/dashboard\/"/);
 assert.match(client,/location\.replace\(data\?\.landingPath/);
 assert.match(client,/setTimeout\(\(\)=>location\.replace\(destination\)/);
 assert.doesNotMatch(client,/location\.replace\(data\.landingPath\)/);
});


test('private onboarding scripts all use the centralized API client and staging runtime metadata',()=>{
 for(const name of ['activate','owner','dashboard']){
  const html=read('public/manager-invite/'+name+'/index.html');
  assert.match(html,/meta name="bw-runtime-mode" content="staging"/);
  assert.match(html,/src="\/js\/api-client\.js"/);
  const code=read('public/js/manager-invite-'+(name==='owner'?'owner-entry':name)+'.js');
  assert.match(code,/BW\?\.api\?\.createClient/);
  assert.match(code,/api\.request\(/);
  assert.doesNotMatch(code,/\bfetch\s*\(/);
 }
});

test('manager review queue is mobile-readable, locally filtered and fail-closed on refresh',()=>{
 const html=read('public/manager-invite/dashboard/index.html');
 const js=read('public/js/manager-invite-dashboard.js');
 for(const id of ['reportBranch','reportDay','reportMode','refreshReports','reportFilterStatus'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/Latest 50 reports/);
 assert.match(html,/not manager decisions/);
 assert.match(js,/items=reportData\.reports\.filter\(r=>ids\.has\(String\(r\.location_id\)\)\)/);
 assert.match(js,/r\.report_date===day\.value/);
 assert.match(js,/Number\(r\.needs_attention\)===1/);
 assert.match(js,/r\.blockers/);assert.match(js,/r\.incidents/);
 assert.match(js,/clear\(\);refresh\.disabled=true/);
 assert.match(js,/clear\(\);status\.textContent='Manager access is unavailable/);
 assert.match(js,/reviewEnabled=reportData\.reviewEnabled===true&&!!sessionCsrf/);
 assert.match(js,/if\(!reviewEnabled\|\|!sessionCsrf\)return/);
 assert.match(js,/getCsrfToken:\(\)=>sessionCsrf/);
 assert.match(js,/expectedRevision:Number\(r\.revision_count\)/);
 assert.match(js,/method:'POST'/);assert.doesNotMatch(js,/method:\s*['"](?:PATCH|PUT|DELETE)/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
});

test('owner review overview is staging-gated and cleared before a new scope loads',()=>{
 const worker=read('cloudflare/src/worker.js');
 const js=read('public/js/daily-report-money-v331.js');
 assert.match(worker,/a\.role==="owner"&&managerDailyReviewEnabled\(env\)\?await readOwnerDailyReviewOverview/);
 assert.match(js,/renderReviewOverview\(panel,null\)/);
 assert.match(js,/if\(role==="owner"\)renderReviewOverview\(panel,ops\.reviewOverview\)/);
 assert.match(js,/if\(!current\(\)\)return/);
 assert.match(js,/Correction reason:/);
 assert.match(js,/Current report revision/);
 assert.match(js,/host\.replaceChildren\(\);host\.hidden=true/);
});
