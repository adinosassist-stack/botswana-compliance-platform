import assert from "node:assert/strict";
import fs from "node:fs";

const retired=[
  "public/js/thebe-dock-recovery-geometry-v269.js",
  "public/js/thebe-live-preview-fallback-v272.js",
  "public/js/thebe-live-evidence-v274.js",
  "public/js/thebe-voice-eval-panel-v275.js",
  "public/js/workspace-text-layout-guard-v276.js",
  "public/js/workspace-property-route-isolation-v277.js",
  "public/js/workspace-focus-visible-v278.js"
];
for(const path of retired)assert.equal(fs.existsSync(path),false,"unrouted standalone runtime must stay deleted: "+path);

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
for(const asset of retired.map(path=>path.split("/").pop()))assert.ok(!production.includes(asset),"production must not route retired asset: "+asset);

for(const live of [
  "public/js/thebe-live-voice.js",
  "public/js/property-visibility-v230.js",
  "public/js/workspace-runtime-20261001b.js",
  "public/assets/property-calculator-reference-v224.css",
  "public/assets/thebe-spatial-dock-v246.css"
])assert.ok(fs.existsSync(live),"referenced live asset must remain: "+live);

console.log("v290 dead standalone runtime cleanup: ok");
