import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const home=read('public/home.html');
const auth=read('public/auth.html');
const authRuntime=read('public/js/auth-portal.js');
const boundaryRuntime=read('public/js/surface-boundaries.js');
const legacy=read('public/index.html');
const directRegistration=read('public/js/register-direct.js');
const governance=read('cloudflare/src/release-governance-entry.js');
const wrangler=read('cloudflare/wrangler.toml');
const fullUser=read('scripts/production-synthetic-full-user-wrapper.mjs');
const mobile=read('scripts/production-mobile-postdeploy-smoke.mjs');
const postdeploy=read('.github/workflows/postdeploy-smoke.yml');

let pass=0;
const ok=(condition,message)=>{assert.ok(condition,message);pass++;console.log('PASS',message)};
const has=(source,needle,message)=>ok(source.includes(needle),message);
const lacks=(source,needle,message)=>ok(!source.includes(needle),message);

has(home,'See business risk before it becomes a penalty, dispute or loss.','public root preserves the canonical homepage hero');
has(home,'href="/auth/?mode=login"','public root links sign-in to the dedicated auth surface');
has(home,'href="/app/"','public root links workspace access to the dedicated app surface');
lacks(home,'/api/auth/me','public root has no session bootstrap dependency');
lacks(home,'/api/state','public root has no private workspace-state dependency');
lacks(home,'id="appShell"','public root cannot render the private workspace shell');
lacks(home,'id="authForm"','public root cannot embed the authentication form');

has(auth,'id="authForm"','auth surface owns an explicit auth form');
has(auth,'/js/api-client.js','auth surface loads only the shared API transport needed for authentication');
has(auth,'/js/auth-portal.js','auth surface loads the dedicated authentication runtime');
lacks(auth,'id="appShell"','auth surface cannot render the private workspace shell');
lacks(auth,'id="marketingGate"','auth surface cannot render the public homepage shell');

has(authRuntime,'/api/auth/me','auth runtime may detect an existing session');
has(authRuntime,'/api/auth/login','auth runtime owns login');
has(authRuntime,'/api/auth/register','auth runtime owns registration');
has(authRuntime,'/api/auth/registration-proof/challenge','auth runtime preserves first-party registration proof');
lacks(authRuntime,'/api/state','auth runtime cannot bootstrap private workspace state');
has(authRuntime,'location.replace(next)','successful authentication leaves the auth surface');

has(governance,'const PUBLIC_HOME_ASSET="/home"','worker fetches the canonical public asset path without triggering Static Assets HTML redirects');
has(governance,'const AUTH_PORTAL_ASSET="/auth"','worker fetches the canonical auth asset path without triggering Static Assets HTML redirects');
lacks(governance,'const PUBLIC_HOME_ASSET="/home.html"','public surface must not fetch the redirecting .html asset path');
lacks(governance,'const AUTH_PORTAL_ASSET="/auth.html"','auth surface must not fetch the redirecting .html asset path');
has(governance,'path==="/"&&!syntheticLegacyRootRequested(request)','plain root is separated from the legacy workspace document');
has(governance,'path==="/auth/"','dedicated auth route is worker-owned');
has(governance,'path==="/app/"','dedicated workspace route is worker-owned');
has(governance,'new URL("/api/auth/me",request.url)','workspace route probes authentication server-side before serving the shell');
has(governance,'if(probe.status===401||probe.status===403)','anonymous workspace access fails closed into authentication');
has(governance,'const initialState=request.method==="GET"?await prefetchedWorkspaceState(request,env,ctx):null','authenticated app route prefetches initial workspace state only for GET shell responses');
has(governance,'new URL("/api/state",request.url)','initial workspace state comes from the canonical authenticated state endpoint');
has(governance,'.replaceAll("<","\\u003c")','embedded workspace JSON escapes script-closing input');
has(governance,'MAX_EMBEDDED_WORKSPACE_STATE_BYTES=512*1024','embedded workspace state has a bounded response-size budget');
has(governance,'new TextEncoder().encode(json).byteLength>MAX_EMBEDDED_WORKSPACE_STATE_BYTES','oversized embedded state fails back to the canonical browser state request');
has(governance,'const html=await shell.clone().text()','workspace embedding preserves the original shell response for fail-safe fallback');
has(governance,'id="thebe-initial-workspace-state"','authenticated app shell carries inert initial state JSON only after server authorization');
has(governance,'headers.set("x-thebe-initial-state","embedded-v1")','embedded-state responses are explicitly marked');
has(governance,'normalizeWorkspaceAssetUrls','workspace HTML normalizes legacy relative assets for the /app/ URL');
has(governance,".replaceAll('src=\"js/','src=\"/js/')",'workspace scripts resolve from the site root under /app/');
has(governance,".replaceAll('href=\"manifest.webmanifest\"','href=\"/manifest.webmanifest\"')",'workspace manifest resolves from the site root under /app/');
has(governance,'injectWorkspaceBoundaryScript','workspace HTML receives the route-boundary runtime');
has(governance,'headers.set("x-thebe-surface",syntheticLegacyRootRequested(request)?"workspace-synthetic":"public")','worker labels normal root as the public surface explicitly');
has(governance,'headers.set("x-thebe-surface","auth")','worker labels the auth surface explicitly');
has(governance,'headers.set("x-thebe-surface","app")','worker labels the app surface explicitly');
has(governance,'SYNTHETIC_LEGACY_ROOT_PARAMS','legacy root compatibility is explicitly bounded to synthetic proof markers');

has(wrangler,'html_handling = "auto-trailing-slash"','existing SEO pretty-route behavior remains unchanged globally');
has(wrangler,'"/auth", "/auth/*", "/app", "/app/*"','Cloudflare worker-first routing covers auth and app boundaries');
has(boundaryRuntime,"if(location.pathname!==\"/app\"&&location.pathname!==\"/app/\")return",'workspace boundary runtime cannot affect the public or auth routes');
has(boundaryRuntime,'window.returnToPublicWebsite','workspace public-exit action is routed to the real public site');
has(boundaryRuntime,'window.showAuth','expired workspace auth is routed to the dedicated auth surface');
has(boundaryRuntime,'if(enforce())return','workspace boundary immediately checks legacy state on installation');
has(boundaryRuntime,'requestAnimationFrame(()=>enforce())','workspace boundary rechecks the initial bootstrap frame');
has(boundaryRuntime,'document.getElementById("authGate"),\n  document.getElementById("marketingGate"),\n  document.getElementById("appShell")','workspace boundary observes only the three route-boundary elements');
has(boundaryRuntime,'for(const node of boundaryNodes)observer.observe(node,{attributes:true,attributeFilter:["class","style"]})','workspace boundary uses targeted non-subtree attribute observation');
lacks(boundaryRuntime,'observer.observe(root,{subtree:true','workspace boundary does not observe the full document subtree');
lacks(boundaryRuntime,'observer.observe(document.body','workspace boundary never attaches a global body observer');
lacks(boundaryRuntime,'getComputedStyle(','workspace boundary avoids forced style/layout reads during bootstrap');
has(boundaryRuntime,'const explicitlyShown=node=>!!node&&node.hidden!==true&&!node.classList.contains("hidden")&&node.style.display!=="none"','workspace boundary uses explicit authored visibility state');
has(governance,'/js/surface-boundaries.js?v=20260918-no-layout-read','workspace route cache-busts the no-layout-read boundary runtime');

has(legacy,'id="appShell"','legacy document remains the qualified private workspace source');
has(legacy,'id="workspaceSidebar"','legacy workspace navigation remains intact');
has(legacy,'async function loadServerState','legacy workspace state loader remains intact behind /app/');
has(legacy,'function consumeInitialWorkspaceState()','workspace client has a one-shot embedded-state consumer');
has(legacy,'const raw=node.textContent||"";node.remove();','embedded state is removed from the DOM immediately after consumption');
has(legacy,'consumeInitialWorkspaceState()||await apiFetch("/api/state")','workspace keeps the canonical browser state request as fallback when embedding is unavailable');
has(directRegistration,'location.href="/app/"','successful direct registration enters the authenticated app route, not public root');
lacks(directRegistration,'location.href="/"','direct registration cannot accidentally return authenticated users to public root');

has(fullUser,'`${ORIGIN}/auth/?mode=login','mandatory full-user proof exercises the dedicated auth surface');
has(fullUser,'`${ORIGIN}/app/?full-user-proof=','mandatory full-user proof exercises the dedicated app surface');
has(fullUser,'plain root rendered the public-only homepage','mandatory full-user proof verifies public separation');
has(mobile,'plain mobile root leaked the workspace shell','mobile smoke explicitly fails on workspace leakage into public root');
has(mobile,"url.pathname==='/auth/'",'mobile smoke proves public-to-auth navigation');
has(mobile,"ORIGIN+'/app/?mobile-boundary='",'mobile smoke proves anonymous app routing');
has(postdeploy,"assert.equal(root.headers.get('x-thebe-surface'),'public')",'postdeploy HTTP smoke proves the live public surface marker');
has(postdeploy,"assert.equal(auth.headers.get('x-thebe-surface'),'auth')",'postdeploy HTTP smoke proves the live auth surface marker');
has(postdeploy,"const app=await get('/app/');",'postdeploy HTTP smoke probes the authenticated app boundary');

console.log(`SURFACE_BOUNDARY_STATIC_PASS ${pass}/${pass}`);
