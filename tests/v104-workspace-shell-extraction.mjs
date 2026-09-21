import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const indexPath="public/index.html";
const runtimePath="public/js/workspace-runtime-20260921a.js";
const workerPath="cloudflare/src/worker.js";
const productionPath="cloudflare/src/production-entry.js";
const budgetPath="scripts/bundle-budget.mjs";

const html=fs.readFileSync(indexPath,"utf8");
const runtime=fs.readFileSync(runtimePath,"utf8");
const worker=fs.readFileSync(workerPath,"utf8");
const production=fs.readFileSync(productionPath,"utf8");
const budget=fs.readFileSync(budgetPath,"utf8");

assert.ok(Buffer.byteLength(html)<650_000,"workspace HTML shell must stay below 650 KB raw");
assert.ok(Buffer.byteLength(runtime)<550_000,"versioned workspace runtime must stay below 550 KB raw");
assert.match(html,/<script id="thebe-workspace-runtime" src="js\/workspace-runtime-20260921a\.js"><\/script>/);
assert.doesNotMatch(html,/const DEFAULT_COMPANY=/,"dominant workspace runtime must not regress back inline");
assert.match(runtime,/const DEFAULT_COMPANY=/);
assert.match(runtime,/async function bootstrap\(\)/);
assert.match(runtime,/let turnstileWidgetId=/,"legacy registration marker must remain available for production rewrite");
assert.match(runtime,/function clearWorkspaceChoice\(\)\{/,"registration rewrite end marker must remain stable");
assert.ok(
  html.indexOf('id="thebe-workspace-runtime"')<html.indexOf('id="v78-workspace-simplification-js"'),
  "workspace runtime must execute before dependent simplification runtime"
);
assert.doesNotMatch(
  html.match(/<script id="thebe-workspace-runtime"[^>]*>/)?.[0]||"",
  /\b(?:async|defer)\b/,
  "workspace runtime must preserve blocking execution order"
);

execFileSync(process.execPath,["--check",runtimePath],{stdio:"pipe"});

assert.match(worker,/immutableWorkspaceRuntime=\/\^\\\/js\\\/workspace-runtime-\[a-z0-9\.\-\]\+\\\.js\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/cache-control","public, max-age=31536000, immutable"/);
assert.match(worker,/cdn-cache-control","public, max-age=31536000, immutable"/);
assert.match(worker,/url\.pathname\.startsWith\("\/js\/"\).*cache-control","no-store, max-age=0"/s,"generic JS must remain no-store");

assert.match(production,/path==="\/js\/workspace-runtime-20260921a\.js"/);
assert.match(production,/repairedRuntime=injectFirstPartyRegistrationClient\(runtime\)/);
assert.match(production,/x-thebe-registration-protection","first-party-proof-v1"/);
assert.match(production,/const FIRST_PARTY_CLIENT_BLOCK=String\.raw/);

assert.match(budget,/html\.length<650_000/);
assert.match(budget,/workspaceRuntime\.length<550_000/);
assert.match(budget,/workspace-runtime-20260921a\.js/);

console.log("v104 workspace shell extraction: PASS");
