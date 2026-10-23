import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/js/workspace-circular-kpis.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/assets/workspace-circular-kpis.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("../cloudflare/src/production-entry.js", import.meta.url), "utf8");
function node(tag) {
  return {
    tag, children: [], attributes: {}, style: { values: {}, setProperty(k, v) { this.values[k] = v; } },
    setAttribute(k, v) { this.attributes[k] = v; },
    append(...items) { this.children.push(...items); },
    set textContent(v) { this.text = v; }
  };
}
function render(input) {
  const window = { document: { createElement: node }, CSS: { supports: () => true } };
  vm.runInNewContext(source, { window });
  return window.ThebeCircularKpi.createCircularKpi(input);
}
test("renders actual percentage and accessible label", () => {
  const kpi = render({ label: "Completed", value: 84.7 });
  assert.equal(kpi.children[0].children[0].text, "85%");
  assert.equal(kpi.children[0].attributes["aria-label"], "Completed: 84.7 percent");
  assert.equal(kpi.children[0].style.values["--ring-value"], "84.7");
});
test("rejects out-of-range and unavailable metrics", () => {
  for (const value of [NaN, -1, 101, undefined, "80"]) {
    const kpi = render({ label: "Coverage", value });
    assert.equal(kpi.children[0].children[0].text, "—");
    assert.equal(kpi.children[0].style.values["--ring-value"], undefined);
  }
});
test("requires a meaningful label", () => assert.equal(render({ label: " ", value: 50 }), null));
test("uses lightweight responsive and forced-colors styles", () => {
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /conic-gradient/);
});
test("workspace entry loads both assets", () => {
  assert.match(entry, /injectBeforeFinalClosingTag\(source,"head",`<link rel="stylesheet" href="\/assets\/workspace-circular-kpis\.css/);
  assert.match(entry, /injectBeforeFinalClosingTag\(source,"body",`<script src="\/js\/workspace-circular-kpis\.js/);
});

test("ratio KPI uses actual counts and rejects invalid denominators", () => {
  const window = { document: { createElement: node }, CSS: { supports: () => true } };
  vm.runInNewContext(source, { window });
  const good = window.ThebeCircularKpi.createRatioKpi({ label: "Complete", numerator: 3, denominator: 4 });
  assert.equal(good.children[0].children[0].text, "75%");
  const bad = window.ThebeCircularKpi.createRatioKpi({ label: "Complete", numerator: 3, denominator: 0 });
  assert.equal(bad.children[0].children[0].text, "—");
});
