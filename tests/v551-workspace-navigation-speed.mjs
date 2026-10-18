import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
assert.match(readiness,/SHARD_ORDER\.slice\(0,3\)/,"idle warmup must be bounded to three shards");
assert.match(readiness,/window\.prefetchThebeWorkspaceShard\(shard\)/,"idle warmup must share navigation promises");
assert.match(readiness,/addEventListener\("touchstart",prefetchOnNavigationIntent/,"mobile navigation must be prefetched on touch");
assert.match(readiness,/connection\?\.saveData===true/,"constrained data connections must skip prefetch");
assert.match(readiness,/client\.request\(url,\{method:"GET"\}\)/,"fallback remains centralized read-only GET");

const start=runtime.indexOf("function prefetchThebeWorkspaceShard(shard){");
const end=runtime.indexOf("function lazyWorkspaceViewLabel(id){",start);
assert(start>=0&&end>start,"shared shard prefetch must exist before lazy view labels");
const requests=[];
const window={__THEBE_WORKSPACE_READY__:true};
const elements=new Map([
  ["allowed",{dataset:{lazyView:"1"}}],
  ["denied",{dataset:{lazyView:"1"}}]
]);
const prefetch=vm.createContext({
  window,document:{getElementById:id=>elements.get(id)||null},
  WORKSPACE_VIEW_FRAGMENT_SHARD_COUNT:12,
  WORKSPACE_VIEW_FRAGMENT_PREFIX:"/assets/workspace-view-fragments-20261001a-",
  workspaceViewShardPromises:new Map(),
  fetchWorkspaceViewShard:(url,shard)=>{requests.push({url,shard});return Promise.resolve({schema:2,shard,views:{}});},
  workspaceViewFragments:id=>Promise.resolve({[id]:"markup"}),
  roleCanView:id=>id==="allowed"
});
vm.runInContext(runtime.slice(start,end),prefetch);
const first=window.prefetchThebeWorkspaceShard(4),second=window.prefetchThebeWorkspaceShard(4);
assert.strictEqual(first,second,"prefetches for one shard must share their in-flight promise");
await Promise.all([first,second]);
assert.equal(requests.length,1,"one shard must make one read-only request");
assert.equal(requests[0].url,"/assets/workspace-view-fragments-20261001a-4.json");
assert.equal(await window.prefetchThebeWorkspaceShard(-1),false);
assert.equal(await window.prefetchThebeWorkspaceView("denied"),false,"role-denied views must not prefetch");
assert.equal(await window.prefetchThebeWorkspaceView("allowed"),true);

const navStart=runtime.indexOf("let workspacePendingRenderToken=0;");
const navEnd=runtime.indexOf('let lastWorkspaceView="dashboard";',navStart);
assert(navStart>=0&&navEnd>navStart,"deferred nav rendering helper must be present");
assert.match(runtime,/scheduleWorkspaceNavigationRender\(id,target,workspaceNavigationEpoch\)/,
  "normal navigation must use the paint-aware refresh scheduler");
const frames=[],tasks=[],painted=[];
const nav=vm.createContext({
  document:{visibilityState:"visible"},
  requestAnimationFrame:fn=>frames.push(fn),
  setTimeout:fn=>tasks.push(fn),
  renderAll:()=>painted.push("render"),
  scheduleResidentPropertyVisibility:()=>painted.push("property")
});
vm.runInContext("let workspaceViewNavigationEpoch=1;\n"+runtime.slice(navStart,navEnd),nav);
const target={classList:{contains:value=>value==="active"}};
nav.scheduleWorkspaceNavigationRender("dashboard",target,1);
assert.deepEqual(painted,[],"heavy rendering must not block the first navigation paint");
assert.equal(frames.length,1,"render must yield to the next animation frame");
frames.shift()();
assert.deepEqual(painted,[],"heavy rendering must wait until after the frame");
tasks.shift()();
assert.deepEqual(painted,["render"]);
nav.scheduleWorkspaceNavigationRender("dashboard",target,1);
vm.runInContext("workspaceViewNavigationEpoch=2",nav);
frames.shift()();tasks.shift()();
assert.deepEqual(painted,["render"],"stale navigations must not render after another view opens");
console.log("PASS: bounded intent prefetch, shared shard promises, role gating and paint-aware workspace refresh");
