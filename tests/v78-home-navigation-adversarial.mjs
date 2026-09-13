import fs from 'node:fs';
import assert from 'node:assert/strict';
import {injectOwnerCommandCentreAssets} from '../cloudflare/src/production-entry.js';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
const productionEntry=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const checks=[];
const ok=(name,cond)=>{assert.ok(cond,name);checks.push(name)};

// Pass 1 — navigation clarity / session continuity.
ok('package bumped for home navigation hardening',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=20);
ok('workspace Home remains the dashboard',/<button[^>]*class="active nav-primary"[^>]*data-view="dashboard"[^>]*>[\s\S]*?<span>Home<\/span><\/button>/.test(html));
ok('workspace brand explicitly returns to website',html.includes('class="brand workspace-brand-link"')&&html.includes('data-bw-onclick="returnToPublicWebsite()"')&&html.includes('aria-label="Back to Thebe Desk website"'));
ok('desktop sidebar exposes a labelled website exit',html.includes('class="sidebar-website-link"')&&html.includes('← Back to website'));
ok('More tools exposes website exit for mobile and keyboard users',html.includes('["__website","Back to website","Open the public BW homepage","←"]')&&html.includes('if(id==="__website")return returnToPublicWebsite()'));
const websiteFn=html.slice(html.indexOf('function returnToPublicWebsite()'),html.indexOf('function returnToWorkspace()'));
ok('website exit does not log the user out',websiteFn.includes('showMarketing();')&&!websiteFn.includes('logoutUser('));
ok('last permitted workspace view is retained',html.includes('let lastWorkspaceView="dashboard"')&&html.includes('lastWorkspaceView=id')&&html.includes('roleCanView(lastWorkspaceView,role)?lastWorkspaceView:roleLandingView(role)'));
ok('signed-in marketing page offers Open workspace',html.includes('id="marketingWorkspaceBtn"')&&html.includes('id="marketingHeroWorkspaceBtn"')&&html.includes('function syncMarketingSessionActions()'));
ok('guest-only controls hide during resumable session',html.includes("document.querySelectorAll('#marketingGate [data-guest-action]').forEach(el=>{el.hidden=canResume})"));

// Pass 2 — authorization boundaries.
ok('only valid workspace roles may resume from public website',html.includes('const canResume=isWorkspaceRole(currentUser?.role)')&&html.includes('if(!isWorkspaceRole(role)){openAuthFromMarketing(\'login\');return false}'));
ok('resume target is checked again against role matrix',html.includes('const target=roleCanView(lastWorkspaceView,role)?lastWorkspaceView:roleLandingView(role)'));
ok('reviewer and auditor still do not receive leadership Home',!html.match(/const REVIEW_ALLOWED=new Set\(\[[^\]]*"dashboard"/s)&&!html.match(/const AUDIT_ALLOWED=new Set\(\[[^\]]*"dashboard"/s));
ok('employee remains outside normal workspace roles',html.includes('const WORKSPACE_ROLES=new Set(["owner","manager","reviewer","auditor"])'));
ok('restricted-role public website link does not open workspace',html.includes('<button class="btn soft" type="button" data-bw-onclick="showMarketing()">Public website</button>'));

// Pass 3 — accessibility / safe UI contract.
ok('brand control has keyboard focus treatment',html.includes('.workspace-brand-link:focus-visible'));
ok('sidebar website control has keyboard focus treatment',html.includes('.sidebar-website-link:focus-visible'));
ok('session-only and guest-only controls use hidden state',html.includes('.marketing-session-action[hidden],.marketing-guest-action[hidden]{display:none!important}'));
ok('mobile workspace navigation remains separately role-filtered',html.includes('function syncMobileRoleNav(role=currentWorkspaceRole())'));
ok('service worker cache is bumped for the navigation release',sw.includes(`bw-business-protection-v78-${pkg.version}`)&&!sw.includes("bwcos-v10"));
ok('PWA manifest uses current product naming',manifest.name==='Thebe Desk'&&manifest.short_name==='Thebe Desk');
ok('website return keeps app hidden while public page is shown',html.includes('marketingGate.classList.remove("hidden");authGate.classList.add("hidden");appShell.style.visibility="hidden"'));

// Pass 4 — production HTML must never inject runtime assets into HTML strings embedded in app JavaScript.
ok('production injection targets the final document closing tag',productionEntry.includes('lastIndexOf(closing)')&&productionEntry.includes('injectBeforeFinalClosingTag(source,"body"')&&!productionEntry.includes('source.replace(/<\\/body>/i'));
const synthetic='<html><head><script>const header=`</head>`;</script></head><body><script>const printable=`<html><body>report</body></html>`;</script></body></html>';
const transformed=injectOwnerCommandCentreAssets(synthetic);
const printableScriptEnd=transformed.indexOf('</script>',transformed.indexOf('const printable='));
const finalBodyClose=transformed.toLowerCase().lastIndexOf('</body>');
for(const asset of ['/js/owner-command-centre.js','/js/executive-personalization.js','/js/business-data-bridge.js']){
  const index=transformed.indexOf(asset);
  ok(`${asset} is injected after the app script and before the final body close`,index>printableScriptEnd&&index<finalBodyClose);
}
const finalHeadClose=transformed.toLowerCase().lastIndexOf('</head>');
for(const asset of ['/assets/owner-command-centre.css','/assets/executive-personalization.css','/assets/business-data-bridge.css']){
  const index=transformed.indexOf(asset);
  ok(`${asset} is injected only at the final document head`,index>transformed.indexOf('</script>')&&index<finalHeadClose);
}
ok('embedded printable body close remains intact',transformed.includes('const printable=`<html><body>report</body></html>`;'));

console.log(`v78 home navigation adversarial: ${checks.length}/${checks.length} checks passed`);
