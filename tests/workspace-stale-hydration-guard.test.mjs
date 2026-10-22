import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The lazy-view client is embedded in a template literal in production-entry.js.
// Assert ordering in the emitted source so a refactor cannot move the stale check
// back after the expensive DOM insertion.
const source = readFileSync(new URL("../cloudflare/src/production-entry.js", import.meta.url), "utf8");
const start = source.indexOf("async function hydrateLazyWorkspaceView(id,target,options={})");
const end = source.indexOf("\n\x60;", start);
const hydrate = source.slice(start, end);

test("lazy workspace hydration checks navigation epoch before DOM rendering", () => {
  assert.ok(start >= 0 && end > start, "hydration runtime must be present");
  const stale = hydrate.indexOf('if(Number(target.dataset.lazyNavigationEpoch||0)!==workspaceViewNavigationEpoch)');
  const render = hydrate.indexOf("window.BW.dom.renderMarkup(target,markup);");
  assert.ok(stale >= 0 && render > stale, "stale navigation must be rejected before DOM render");
  const guard = hydrate.slice(stale, render);
  assert.match(guard, /delete target\.dataset\.lazyLoading/);
  assert.match(guard, /target\.setAttribute\("aria-busy","false"\)/);
  assert.match(guard, /return true/);
  assert.doesNotMatch(guard, /delete target\.dataset\.lazyView|removeAttribute\("data-lazy-view"\)/);
});
