import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../public/js/thebe-dock-recovery-geometry-v269.js", import.meta.url), "utf8");

test("public Market dock fallback never injects a false reserved right rail", () => {
  const reserve = source.split("function reserveDesktopLane(dock,dockWidth){")[1]?.split("function releaseDesktopLane()")[0];
  assert.ok(reserve, "fallback lane routine must exist");
  assert.match(reserve, /if\(dock\.dataset\.surface==="workspace"\)/);
  assert.match(reserve, /releaseNode\(marketingGate\)/);
  assert.doesNotMatch(reserve, /setOwned\(marketingGate,/);
  assert.doesNotMatch(reserve, /"padding-right"\s*:/);
});

test("workspace still reserves space in emergency desktop fallback", () => {
  const reserve = source.split("function reserveDesktopLane(dock,dockWidth){")[1]?.split("function releaseDesktopLane()")[0];
  assert.ok(reserve);
  assert.match(reserve, /setOwned\(workspaceMain,/);
  assert.match(reserve, /"margin-right":\x60calc\(\$\{dockWidth\}px \+ 32px\)\x60/);
  assert.match(source, /if\(width>=1024\)reserveDesktopLane\(dock,widthFor\(width,expanded\)\)/);
  assert.match(source, /else releaseDesktopLane\(\)/);
});

test("resize separator exposes current bounds and supports accessible controls", () => {
  assert.match(source, /handle\.setAttribute\("role","separator"\)/);
  assert.match(source, /handle\.setAttribute\("aria-valuemin",String\(bounds\.min\)\)/);
  assert.match(source, /handle\.setAttribute\("aria-valuemax",String\(bounds\.max\)\)/);
  assert.match(source, /handle\.setAttribute\("aria-valuenow",String\(clamped\)\)/);
  assert.match(source, /handle\.addEventListener\("keydown"/);
});

test("pointer cancellation and capture loss release resizing state", () => {
  assert.match(source, /handle\.addEventListener\("pointercancel",stopDrag\)/);
  assert.match(source, /handle\.addEventListener\("lostpointercapture",stopDrag\)/);
  assert.match(source, /global\.document\?\.body\?\.classList\?\.remove\("thebe-workspace-dock-resizing"\)/);
  assert.match(source, /handle\.releasePointerCapture\?\.\(pointerId\)/);
});

test("saved floating workspace dock is clamped when the viewport changes", () => {
  const repair = source.split("function repair(){")[1]?.split("function schedule()")[0];
  assert.ok(repair);
  assert.match(repair, /if\(dock\.dataset\.workspaceFloating==="true"\)/);
  assert.match(repair, /if\(saved\)setDockPosition\(dock,saved\)/);
});
