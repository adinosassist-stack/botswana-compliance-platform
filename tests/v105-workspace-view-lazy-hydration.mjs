import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const fragments=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20260923f.json","utf8"));
const fragmentShards=Array.from({length:12},(_,i)=>JSON.parse(fs.readFileSync(`public/assets/workspace-view-fragments-20260923f-${i}.json`,"utf8")));
const viewShard=id=>{let hash=0;for(const ch of String(id||""))hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;return hash%12};
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const fullUserProof=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");
const coreWorkspaceScripts=["dom-security.js","event-delegation.js","notifications.js","dialog-service.js","api-client.js","state-store.js","components.js"];
for(const script of coreWorkspaceScripts){
  assert.ok(html.includes(`<script src="/js/${script}"></script>`),`workspace core asset must be root-relative for /app/: ${script}`);
}
assert.ok(!html.includes('src="js/')&&!html.includes("src=\'js/"),"workspace core scripts must not resolve under /app/js/");

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260923k.js","utf8");
const delegatedEvents=fs.readFileSync("public/js/event-delegation.js","utf8");
assert.match(delegatedEvents,/\'linkSocial\'/,"social connect action must remain in delegated event allowlist");

function sectionBounds(source,start){
  const openEnd=source.indexOf(">",start)+1;
  assert.ok(openEnd>0,"view opening tag must close");
  const token=/<\/?section\b[^>]*>/gi;
  token.lastIndex=start;
  let depth=0,match;
  while((match=token.exec(source))){
    if(/^<section\b/i.test(match[0]))depth+=1;
    else depth-=1;
    if(depth===0)return {openEnd,closeStart:match.index,end:token.lastIndex};
  }
  throw new Error("view section did not close");
}
const canonicalViews=[...html.matchAll(/<section\b([^>]*)>/gi)].map(match=>{
  const attrs=String(match[1]||"");
  const id=(attrs.match(/\bid=["']([^"']+)["']/i)||[])[1]||"";
  const cls=(attrs.match(/\bclass=["']([^"']+)["']/i)||[])[1]||"";
  return {id,cls,start:match.index};
}).filter(view=>/\bview\b/.test(view.cls));
assert.equal(canonicalViews.length,68,"canonical workspace view count changed; reassess lazy-view boundary");
const primaryResidentViews=["dashboard","workhub","sites","peopleops","businesshub","obligations","evidencehub","automationhub"];
assert.deepEqual(fragments.residentViews,primaryResidentViews,"primary workspace navigation must remain resident and independent of fragment delivery");
const lazyViews=canonicalViews.filter(view=>!fragments.residentViews.includes(view.id));
assert.equal(lazyViews.length,60,"expected only 60 deep workspace views to remain lazy");
assert.deepEqual(Object.keys(fragments.views).sort(),lazyViews.map(view=>view.id).sort(),"fragment bundle must cover every lazy view exactly once");
for(const view of lazyViews){
  const bounds=sectionBounds(html,view.start);
  const canonical=html.slice(bounds.openEnd,bounds.closeStart);
  assert.equal(fragments.views[view.id],canonical,`fragment ${view.id} must exactly match canonical inner markup`);
  assert.doesNotMatch(canonical,/<(?:script|iframe|object|embed|base|meta|link|img|svg|math|video|audio|source|track)\b/i,`fragment ${view.id} must stay compatible with BW.dom sanitizer`);
}

assert.match(production,/WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT=12/);
assert.ok(production.includes('const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20260923f-";'));
assert.ok(production.includes("function workspaceViewShard(id){"));
assert.ok(production.includes("const workspaceViewShardPromises=new Map();"));
assert.ok(production.includes("async function workspaceViewFragments(id){"));
assert.ok(production.includes('const WORKSPACE_RESIDENT_VIEW_IDS=Object.freeze(["dashboard","workhub","sites","peopleops","businesshub","obligations","evidencehub","automationhub"]);'));
const lazyConstant=(production.match(/const WORKSPACE_LAZY_VIEW_IDS=Object\.freeze\((\[[^\n]+\])\);/)||[])[1];
assert.ok(lazyConstant,"production lazy-view constant must remain parseable");
const productionLazyViews=JSON.parse(lazyConstant);
for(const id of primaryResidentViews)assert.equal(productionLazyViews.includes(id),false,"resident primary view "+id+" must not be in the production lazy list");
assert.equal(productionLazyViews.length,60,"production lazy list must match regenerated fragments");
assert.match(production,/function externalizeWorkspaceViews\(html\)/);
for(const id of primaryResidentViews){
  const pattern=new RegExp('<section\\b[^>]*\\bid=["\\\']'+id+'["\\\'][^>]*data-lazy-view="1"',"i");
  assert.doesNotMatch(production,pattern,"resident view "+id+" must never be externalized by production entry");
}
assert.match(production,/data-lazy-view="1"/);
assert.match(production,/function injectWorkspaceLazyViewClient\(runtime\)/);
const seen=new Set();
for(let i=0;i<fragmentShards.length;i++){
  const payload=fragmentShards[i];
  assert.equal(payload.schema,2,`shard ${i} schema mismatch`);
  assert.equal(payload.shard,i,`shard ${i} index mismatch`);
  for(const [id,markup] of Object.entries(payload.views)){
    assert.equal(viewShard(id),i,`view ${id} is in the wrong shard`);
    assert.equal(fragments.views[id],markup,`sharded markup drift for ${id}`);
    assert.ok(!seen.has(id),`view ${id} duplicated across shards`);
    seen.add(id);
  }
}
assert.equal(seen.size,Object.keys(fragments.views).length,"shards must cover every lazy view exactly once");
assert.equal(Object.prototype.hasOwnProperty.call(fragments.views,"peopleops"),false,"People must not depend on lazy fragment delivery");
for(const payload of fragmentShards)assert.equal(Object.prototype.hasOwnProperty.call(payload.views,"peopleops"),false,"People must not appear in any lazy shard");
const peopleCanonical=html.slice(sectionBounds(html,canonicalViews.find(view=>view.id==="peopleops").start).openEnd,sectionBounds(html,canonicalViews.find(view=>view.id==="peopleops").start).closeStart);
assert.match(peopleCanonical,/People & operations/,"resident People content must remain in canonical workspace HTML");
assert.doesNotMatch(peopleCanonical,/Ruleset integrity|Sources in this prototype/i,"resident People content must not contain regulatory source prototype copy");
assert.match(String(fragmentShards[viewShard("sources")].views.sources||""),/Authoritative source registry/,"source governance content must remain scoped to the Sources view");
assert.ok(production.includes('const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20260923k.js";'),"workspace runtime identity must rotate with injected runtime behavior");
assert.match(production,/window\.BW\?\.dom\?\.renderMarkup/,"hydration must use the sanctioned DOM sanitizer");
assert.match(runtime,/let workspaceViewNavigationEpoch=0/,"static versioned runtime must carry lazy navigation state");
assert.match(runtime,/function hydrateLazyWorkspaceView\(id,target,options=\{\}\)/,"static versioned runtime must hydrate lazy views itself");
assert.match(runtime,/const workspaceFragmentClient=window\.BW\?\.api\?\.createClient\?\.\(\{timeoutMs:6000,retries:1\}\)/,"static versioned runtime must use centralized bounded fragment transport");
assert.match(runtime,/function fetchWorkspaceViewShard\(asset,shard\)/,"static versioned runtime must own fragment transport wrapper");
assert.match(production,/source\.includes\("function hydrateLazyWorkspaceView\("/,"Worker lazy-runtime repair must be idempotent when the static runtime is already hydrated");
assert.match(runtime,/workspaceFragmentClient\.request\(asset,\{method:"GET"\}\)/,"lazy fragments must flow through the centralized same-origin browser transport");
assert.match(production,/target\.dataset\.lazyView==="1"/);
assert.match(production,/function activateLazyWorkspacePlaceholder\(id,target\)/,"lazy navigation must activate its destination before network hydration");
assert.match(production,/setLazyWorkspaceMessage\(target,"Loading "\+label\+"…"/,"lazy navigation must visibly replace the previous view while loading");
assert.match(production,/target\.dataset\.lazyError="1"/,"lazy hydration failure must expose a visible error state");
assert.match(production,/activateLazyWorkspacePlaceholder\(id,target\);void hydrateLazyWorkspaceView/,"showView must stop leaving the previous view visible during lazy fetches");
assert.match(production,/hydrateLazyWorkspaceView\(id,target,options\)/);
assert.match(production,/let workspaceViewNavigationEpoch=0/,"lazy navigation must carry a monotonic epoch");
assert.match(production,/target\.dataset\.lazyNavigationEpoch=String\(workspaceNavigationEpoch\)/,"every lazy navigation must record its latest requested epoch");
assert.match(production,/requestedEpoch!==workspaceViewNavigationEpoch/,"stale hydration completion must not reactivate an older view");
assert.match(production,/preserveNavigationEpoch:true/,"hydrated activation must not invalidate its own winning navigation epoch");
let adversarialEpoch=0;
const adversarialTargets=new Map();
const requestView=id=>{const epoch=++adversarialEpoch;adversarialTargets.set(id,epoch);return epoch};
const completionWins=id=>adversarialTargets.get(id)===adversarialEpoch;
requestView("employees");requestView("corporate");
assert.equal(completionWins("employees"),false,"older lazy completion must lose after a newer navigation");
assert.equal(completionWins("corporate"),true,"latest lazy completion must win");
requestView("vault");requestView("vault");
assert.equal(completionWins("vault"),true,"repeat click on the same loading view must preserve latest intent");
assert.match(production,/externalizeWorkspaceViews\(externalizeWorkspaceHeadStyles\(externalizeWorkspaceRuntime\(baseHtml\)\)\)/);
assert.match(production,/injectWorkspaceLazyViewClient\(injectFirstPartyRegistrationClient\(runtime\)\)/);

assert.match(fullUserProof,/page\.locator\(\`#nav button\[data-view="/,"live owner matrix must locate the real workspace navigation button for every view");
assert.match(fullUserProof,/await summary\.click\(\)/,"live owner matrix must open collapsed navigation groups through their summary controls");
assert.match(fullUserProof,/await button\.click\(\)/,"live owner matrix must activate workspace views through real button clicks");
assert.match(fullUserProof,/target\?\.dataset\?\.lazyView==='1'\|\|target\?\.dataset\?\.lazyHydrated==='1'/,"live owner click matrix must classify lazy or previously hydrated views");
assert.match(fullUserProof,/target\?\.dataset\?\.lazyHydrated==='1'\|\|target\?\.dataset\?\.lazyError==='1'/,"live owner click matrix must wait for lazy hydration terminal state");
assert.ok(fullUserProof.includes("did not complete hydration after its real navigation click"),"live owner click matrix must fail closed on any lazy hydration failure");
assert.ok(fullUserProof.includes("hydrated with empty content after its real navigation click"),"live owner click matrix must reject empty hydrated fragments");
assert.match(fullUserProof,/MIN_SAFE_UI_ACTION_COUNT=5/,"live owner proof must exercise a minimum set of safe non-navigation controls");
assert.match(fullUserProof,/safeUiActionProbeActive=true/,"safe action probe must be explicitly bounded");
assert.match(fullUserProof,/safeUiMutationRequests\.push/,"safe action probe must record any same-origin mutation request");
assert.match(fullUserProof,/#quickNav:visible/,"safe action matrix must click the real command palette trigger");
assert.match(fullUserProof,/openAddEvidence\(\)/,"safe action matrix must click Add evidence");
assert.match(fullUserProof,/openModal\('scanModal'\)/,"safe action matrix must open the compliance scan modal without running it");
assert.match(fullUserProof,/openOnboarding\(\)/,"safe action matrix must open Guided setup");
assert.match(fullUserProof,/openLicenceEntry\(\)/,"safe action matrix must open Add licence details");
assert.match(fullUserProof,/safeUiMutationRequests\.length===0/,"safe action matrix must fail closed if UI-only controls issue mutations");
assert.ok(fullUserProof.includes("full-user safe UI action matrix"),"live proof must report non-navigation UI action completion");
assert.match(fullUserProof,/MIN_OWNER_INVIEW_NAV_CONTROL_COUNT=25/,"live owner proof must retain a fail-closed minimum for in-view controls");
assert.match(fullUserProof,/button\[data-bw-onclick\]/,"live owner proof must discover real in-view delegated buttons");
assert.match(fullUserProof,/expression\.match\(\/\^showView/,"in-view matrix must restrict itself to non-destructive showView controls");
assert.match(fullUserProof,/await controlButton\.click\(\)/,"in-view matrix must click the real source-view control");
assert.match(fullUserProof,/const ordinal=buttons\.slice\(0,index\)\.filter/,"in-view matrix must preserve same-expression ordinal across rerenders");
assert.match(fullUserProof,/button\[data-bw-onclick="\$\{escapedExpression\}"\]/,"in-view matrix must relocate controls by exact delegated expression rather than stale global index");
assert.match(fullUserProof,/controlButton\.locator\('xpath=ancestor::details\[1\]'\)/,"in-view matrix must recover controls hidden only because their disclosure reset closed");
assert.match(fullUserProof,/await disclosureSummary\.click\(\)/,"in-view matrix must reopen a collapsed disclosure through its real summary control before clicking a nested navigation control");
assert.doesNotMatch(fullUserProof,/in-view navigation expression changed before click/,"in-view matrix must not rely on stale positional identity after source rerenders");
assert.ok(fullUserProof.includes("in-view navigation control failed"),"in-view matrix must fail closed when a real control does not activate its target");
assert.ok(fullUserProof.includes("full-user in-view navigation control matrix"),"live proof must report in-view navigation completion");

assert.match(runtime,/const workspaceNavigationEpoch=options\?\.preserveNavigationEpoch===true\?workspaceViewNavigationEpoch:\+\+workspaceViewNavigationEpoch;if\(target\.dataset\.lazyView==="1"&&options\?\.lazyHydrated!==true\)\{target\.dataset\.lazyNavigationEpoch=String\(workspaceNavigationEpoch\);activateLazyWorkspacePlaceholder\(id,target\);void hydrateLazyWorkspaceView\(id,target,options\);return true\}/,"canonical showView must carry the baked lazy interception branch");
assert.match(runtime,/const shouldRender=view=>\{if\(!roleCanView\(view\)\)return false;const target=document\.getElementById\(view\),active=!!target\?\.classList\.contains\("active"\),coldLanding=window\.__THEBE_WORKSPACE_READY__!==true&&view===roleLandingView\(currentUser\?\.role\);return active\|\|coldLanding\}/,"render fan-out must remain active-or-cold-landing only");

assert.match(worker,/immutableWorkspaceViewFragments=\/\^\\\/assets\\\/workspace-view-fragments-\[a-z0-9\.\-\]\+\\\.json\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/immutableWorkspaceRuntime\|\|immutableWorkspaceStyles\|\|immutableWorkspaceViewFragments/);
assert.match(worker,/cache-control","public, max-age=31536000, immutable"/);

console.log("v105 lazy workspace view hydration: PASS");
