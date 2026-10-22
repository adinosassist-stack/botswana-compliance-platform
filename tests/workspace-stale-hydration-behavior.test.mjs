import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const sources = [
  ["worker fallback", "../cloudflare/src/production-entry.js", "\n`;"],
  ["active workspace runtime", "../public/js/workspace-runtime-20261001b.js", "\nfunction enforceResidentPropertyVisibility"]
];
for (const [label, path, endMarker] of sources) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const start = source.indexOf("async function hydrateLazyWorkspaceView(id,target,options={})");
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${label} hydration function must exist`);
  const runtime = source.slice(start, end);

  function harness() {
    const events = [];
    const target = {
      dataset: { lazyView: "1", lazyNavigationEpoch: "1" },
      setAttribute(k,v) { events.push(["attr",k,v]); },
      removeAttribute(k) { events.push(["remove",k]); if(k==="data-lazy-view")delete this.dataset.lazyView; if(k==="data-lazy-view-id")delete this.dataset.lazyViewId; }
    };
    let resolveShard;
    const shard = new Promise(resolve => { resolveShard = resolve; });
    const context = {
      workspaceViewNavigationEpoch: 1,
      workspaceViewFragments: () => shard,
      document: { getElementById: () => ({textContent:""}) },
      window: { BW: { dom: { renderMarkup: () => events.push(["render"]) } } },
      showView: () => { events.push(["show"]); return true; },
      console
    };
    vm.createContext(context);
    vm.runInContext(runtime,context);
    return { context,target,events,resolveShard };
  }

  test(`${label}: abandoned lazy navigation skips DOM work and stays retryable`, async () => {
    const h=harness();
    const pending=h.context.hydrateLazyWorkspaceView("people",h.target);
    h.context.workspaceViewNavigationEpoch=2;
    h.resolveShard({people:"<section>People</section>"});
    assert.equal(await pending,true);
    assert.equal(h.events.some(x=>x[0]==="render"),false);
    assert.equal(h.events.some(x=>x[0]==="show"),false);
    assert.equal(h.target.dataset.lazyView,"1");
    assert.equal(h.target.dataset.lazyLoading,undefined);
  });

  test(`${label}: returning to a pending lazy navigation renders latest requested epoch`, async () => {
    const h=harness();
    const pending=h.context.hydrateLazyWorkspaceView("people",h.target);
    h.context.workspaceViewNavigationEpoch=3;
    h.target.dataset.lazyNavigationEpoch="3";
    h.resolveShard({people:"<section>People</section>"});
    assert.equal(await pending,true);
    assert.equal(h.events.filter(x=>x[0]==="render").length,1);
    assert.equal(h.events.filter(x=>x[0]==="show").length,1);
    assert.equal(h.target.dataset.lazyView,undefined);
  });

}
