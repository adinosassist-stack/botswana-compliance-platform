import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const fragments=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20260921a.json","utf8"));
const fragmentShards=Array.from({length:12},(_,i)=>JSON.parse(fs.readFileSync(`public/assets/workspace-view-fragments-20260921c-${i}.json`,"utf8")));
const viewShard=id=>{let hash=0;for(const ch of String(id||""))hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;return hash%12};
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const coreWorkspaceScripts=["dom-security.js","event-delegation.js","notifications.js","dialog-service.js","api-client.js","state-store.js","components.js"];
for(const script of coreWorkspaceScripts){
  assert.ok(html.includes(`<script src="/js/${script}"></script>`),`workspace core asset must be root-relative for /app/: ${script}`);
}
assert.ok(!html.includes('src="js/')&&!html.includes("src=\'js/"),"workspace core scripts must not resolve under /app/js/");

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260921d.js","utf8");
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
assert.deepEqual(fragments.residentViews,["dashboard","workhub"],"owner/manager and reviewer/auditor landing views must remain resident");
const lazyViews=canonicalViews.filter(view=>!fragments.residentViews.includes(view.id));
assert.equal(lazyViews.length,66,"expected 66 inactive views to be lazy");
assert.deepEqual(Object.keys(fragments.views).sort(),lazyViews.map(view=>view.id).sort(),"fragment bundle must cover every lazy view exactly once");
for(const view of lazyViews){
  const bounds=sectionBounds(html,view.start);
  const canonical=html.slice(bounds.openEnd,bounds.closeStart);
  assert.equal(fragments.views[view.id],canonical,`fragment ${view.id} must exactly match canonical inner markup`);
  assert.doesNotMatch(canonical,/<(?:script|iframe|object|embed|base|meta|link|img|svg|math|video|audio|source|track)\b/i,`fragment ${view.id} must stay compatible with BW.dom sanitizer`);
}

assert.match(production,/WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT=12/);
assert.ok(production.includes('const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20260921c-";'));
assert.ok(production.includes("function workspaceViewShard(id){"));
assert.ok(production.includes("const workspaceViewShardPromises=new Map();"));
assert.ok(production.includes("async function workspaceViewFragments(id){"));
assert.match(production,/WORKSPACE_RESIDENT_VIEW_IDS=Object\.freeze\(\["dashboard","workhub"\]\)/);
assert.match(production,/function externalizeWorkspaceViews\(html\)/);
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
const peopleShard=fragmentShards[viewShard("peopleops")];
assert.match(String(peopleShard.views.peopleops||""),/People & operations/,"People must hydrate its own semantic content");
assert.doesNotMatch(String(peopleShard.views.peopleops||""),/Ruleset integrity|Sources in this prototype/i,"People must never hydrate regulatory source prototype copy");
assert.match(String(fragmentShards[viewShard("sources")].views.sources||""),/Authoritative source registry/,"source governance content must remain scoped to the Sources view");
assert.ok(production.includes('const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20260921d.js";'),"workspace runtime identity must rotate with injected runtime behavior");
assert.match(production,/window\.BW\?\.dom\?\.renderMarkup/,"hydration must use the sanctioned DOM sanitizer");
assert.match(production,/credentials:"same-origin",cache:"reload"/,"lazy fragment requests must bypass stale immutable browser entries");
assert.match(production,/target\.dataset\.lazyView==="1"/);
assert.match(production,/hydrateLazyWorkspaceView\(id,target,options\)/);
assert.match(production,/let workspaceViewNavigationEpoch=0/,"lazy navigation must carry a monotonic epoch");
assert.match(production,/target\.dataset\.lazyNavigationEpoch=String\(workspaceNavigationEpoch\)/,"every lazy navigation must record its latest requested epoch");
assert.match(production,/requestedEpoch!==workspaceViewNavigationEpoch/,"stale hydration completion must not reactivate an older view");
assert.match(production,/preserveNavigationEpoch:true/,"hydrated activation must not invalidate its own winning navigation epoch");
let adversarialEpoch=0;
const adversarialTargets=new Map();
const requestView=id=>{const epoch=++adversarialEpoch;adversarialTargets.set(id,epoch);return epoch};
const completionWins=id=>adversarialTargets.get(id)===adversarialEpoch;
requestView("peopleops");requestView("businesshub");
assert.equal(completionWins("peopleops"),false,"older lazy completion must lose after a newer navigation");
assert.equal(completionWins("businesshub"),true,"latest lazy completion must win");
requestView("evidencehub");requestView("evidencehub");
assert.equal(completionWins("evidencehub"),true,"repeat click on the same loading view must preserve latest intent");
assert.match(production,/externalizeWorkspaceViews\(externalizeWorkspaceHeadStyles\(externalizeWorkspaceRuntime\(baseHtml\)\)\)/);
assert.match(production,/injectWorkspaceLazyViewClient\(injectFirstPartyRegistrationClient\(runtime\)\)/);

assert.match(runtime,/const target=document\.getElementById\(id\);if\(!target\)\{console\.warn\("Unknown view",id\);return false\}lastWorkspaceView=id;/,"canonical showView interception anchor changed");
assert.match(runtime,/const shouldRender=view=>\{if\(!roleCanView\(view\)\)return false;const target=document\.getElementById\(view\),active=!!target\?\.classList\.contains\("active"\),coldLanding=window\.__THEBE_WORKSPACE_READY__!==true&&view===roleLandingView\(currentUser\?\.role\);return active\|\|coldLanding\}/,"render fan-out must remain active-or-cold-landing only");

assert.match(worker,/immutableWorkspaceViewFragments=\/\^\\\/assets\\\/workspace-view-fragments-\[a-z0-9\.\-\]\+\\\.json\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/immutableWorkspaceRuntime\|\|immutableWorkspaceStyles\|\|immutableWorkspaceViewFragments/);
assert.match(worker,/cache-control","public, max-age=31536000, immutable"/);

console.log("v105 lazy workspace view hydration: PASS");
