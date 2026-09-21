import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const fragments=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20260921a.json","utf8"));
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260921a.js","utf8");

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

assert.match(production,/WORKSPACE_VIEW_FRAGMENTS_ASSET="\/assets\/workspace-view-fragments-20260921a\.json"/);
assert.match(production,/WORKSPACE_RESIDENT_VIEW_IDS=Object\.freeze\(\["dashboard","workhub"\]\)/);
assert.match(production,/function externalizeWorkspaceViews\(html\)/);
assert.match(production,/data-lazy-view="1"/);
assert.match(production,/function injectWorkspaceLazyViewClient\(runtime\)/);
assert.match(production,/window\.BW\?\.dom\?\.renderMarkup/,"hydration must use the sanctioned DOM sanitizer");
assert.match(production,/credentials:"same-origin",cache:"force-cache"/);
assert.match(production,/target\.dataset\.lazyView==="1"/);
assert.match(production,/hydrateLazyWorkspaceView\(id,target,options\)/);
assert.match(production,/externalizeWorkspaceViews\(externalizeWorkspaceHeadStyles\(externalizeWorkspaceRuntime\(baseHtml\)\)\)/);
assert.match(production,/injectWorkspaceLazyViewClient\(injectFirstPartyRegistrationClient\(runtime\)\)/);

assert.match(runtime,/const target=document\.getElementById\(id\);if\(!target\)\{console\.warn\("Unknown view",id\);return false\}lastWorkspaceView=id;/,"canonical showView interception anchor changed");
assert.match(runtime,/const shouldRender=view=>\{if\(!roleCanView\(view\)\)return false;const target=document\.getElementById\(view\),active=!!target\?\.classList\.contains\("active"\),coldLanding=window\.__THEBE_WORKSPACE_READY__!==true&&view===roleLandingView\(currentUser\?\.role\);return active\|\|coldLanding\}/,"render fan-out must remain active-or-cold-landing only");

assert.match(worker,/immutableWorkspaceViewFragments=\/\^\\\/assets\\\/workspace-view-fragments-\[a-z0-9\.\-\]\+\\\.json\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/immutableWorkspaceRuntime\|\|immutableWorkspaceStyles\|\|immutableWorkspaceViewFragments/);
assert.match(worker,/cache-control","public, max-age=31536000, immutable"/);

console.log("v105 lazy workspace view hydration: PASS");
