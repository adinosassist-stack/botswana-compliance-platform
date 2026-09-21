import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const html=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260921d.js","utf8");
const styles=fs.readFileSync("public/assets/workspace-inline-styles-20260921a.css","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const budget=fs.readFileSync("scripts/bundle-budget.mjs","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");

const inline=html.match(/<script id="thebe-workspace-runtime-inline">([\s\S]*?)<\/script>/);
assert.ok(inline,"canonical inline workspace runtime marker must exist for audit/static contracts");
const normalized=String(inline[1]||"").replace(/^\n/,"").replace(/\s*$/,"")+"\n";
assert.equal(normalized,runtime,"external workspace runtime must be byte-equivalent to canonical inline source");
const headEnd=html.toLowerCase().indexOf("</head>");
assert.ok(headEnd>0,"workspace head must exist");
const canonicalStyles=[...html.slice(0,headEnd).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match=>String(match[1]||"").replace(/^\n/,"").replace(/\s*$/,""));
assert.equal(canonicalStyles.length,48,"workspace must keep the audited 48 canonical head style blocks");
assert.equal(canonicalStyles.join("\n\n")+"\n",styles,"external workspace stylesheet must be byte-equivalent to canonical head styles");
assert.ok(Buffer.byteLength(styles)<220_000,"versioned workspace stylesheet must stay below 220 KB raw");
assert.ok(Buffer.byteLength(runtime)<550_000,"versioned workspace runtime must stay below 550 KB raw");
assert.match(runtime,/const DEFAULT_COMPANY=/);
assert.match(runtime,/async function bootstrap\(\)/);
assert.match(runtime,/let turnstileWidgetId=/);
execFileSync(process.execPath,["--check","public/js/workspace-runtime-20260921d.js"],{stdio:"pipe"});

assert.match(worker,/immutableWorkspaceRuntime=\/\^\\\/js\\\/workspace-runtime-\[a-z0-9\.\-\]\+\\\.js\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/immutableWorkspaceStyles=\/\^\\\/assets\\\/workspace-inline-styles-\[a-z0-9\.\-\]\+\\\.css\$\/i\.test\(url\.pathname\)/);
assert.match(worker,/cache-control","public, max-age=31536000, immutable"/);
assert.match(wrangler,/\/js\/workspace-runtime-\*/,"versioned workspace runtime must run Worker-first so the injected lazy client is actually served");
assert.match(wrangler,/\/assets\/workspace-inline-styles-\*/,"versioned workspace styles must run Worker-first for the declared immutable cache contract");
assert.match(wrangler,/\/assets\/workspace-view-fragments-\*/,"versioned workspace fragments must run Worker-first for the declared immutable cache contract");
assert.match(worker,/url\.pathname\.startsWith\("\/js\/"\).*cache-control","no-store, max-age=0"/s);

assert.match(production,/const WORKSPACE_RUNTIME_ASSET="\/js\/workspace-runtime-20260921c\.js"/);
assert.match(production,/const WORKSPACE_STYLES_ASSET="\/assets\/workspace-inline-styles-20260921a\.css"/);
assert.match(production,/function externalizeWorkspaceRuntime\(html\)/);
assert.match(production,/function externalizeWorkspaceHeadStyles\(html\)/);
assert.match(production,/thebe-workspace-runtime-inline/);
assert.match(production,/surfaceHtml=workspaceSurface\?externalizeWorkspaceViews\(externalizeWorkspaceHeadStyles\(externalizeWorkspaceRuntime\(baseHtml\)\)\):baseHtml/);
assert.match(production,/path===WORKSPACE_RUNTIME_ASSET/);
assert.match(production,/repairedRuntime=injectWorkspaceLazyViewClient\(injectFirstPartyRegistrationClient\(runtime\)\)/);
assert.match(production,/x-thebe-registration-protection","first-party-proof-v1"/);

assert.match(budget,/deployedHtml\.length<160_000/);
assert.match(budget,/normalizedInline===runtimeText/);
assert.match(budget,/workspaceRuntime\.length<550_000/);
assert.match(budget,/workspaceStyles\.length<220_000/);

console.log("v104 workspace production-shell extraction: PASS");
