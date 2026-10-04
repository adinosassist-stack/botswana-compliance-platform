import assert from "node:assert/strict";
import fs from "node:fs";
import {versionReleaseAssets} from "../cloudflare/src/asset-release-identity.js";

const panel=fs.readFileSync("public/js/thebe-voice-eval-panel-v275.js","utf8");
const evidence=fs.readFileSync("public/js/thebe-live-evidence-v274.js","utf8");
const production=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");

assert.match(panel,/currentWorkspaceRole/);
assert.match(panel,/role\(\)==="owner"/,"evaluation cockpit must remain owner-only");
assert.match(panel,/#ownerCommandCentre/);
assert.match(panel,/Voice evaluation/);
assert.match(panel,/showModal\(\)/,"cockpit must use a compact modal instead of expanding workspace scroll");
assert.match(panel,/ThebeVoiceEval\?\.summary/);
assert.match(panel,/ThebeVoiceEval\?\.beginScenario/);
assert.match(panel,/Ready for human review/);
assert.match(panel,/HOLD/);
assert.match(panel,/Production switching remains blocked/);
assert.match(panel,/No provider switch is available from this panel/);
assert.match(panel,/raw audio, transcript or task text/);
assert.doesNotMatch(panel,/productionSwitchAllowed\s*=\s*true/);
assert.doesNotMatch(panel,/deploy|promote to production|switch provider/i,"cockpit must not expose deployment or provider-switch controls");
assert.doesNotMatch(panel,/localStorage/,"evaluation scenario must remain session-scoped");

assert.match(evidence,/sessionStorage/);
assert.match(evidence,/ThebeVoiceEval/);
assert.match(evidence,/beginScenario/);

const sha="a".repeat(40);
const html="<!doctype html><html><head></head><body><main>workspace</main></body></html>";
const app=versionReleaseAssets(html,sha,{includeVoiceEvidence:true});
assert.match(app,/thebe-live-evidence-v274\.js\?release=/);
assert.match(app,/thebe-voice-eval-panel-v275\.js\?release=/);
const publicHtml=versionReleaseAssets(html,sha,{includeVoiceEvidence:false});
assert.doesNotMatch(publicHtml,/thebe-live-evidence-v274\.js/);
assert.doesNotMatch(publicHtml,/thebe-voice-eval-panel-v275\.js/);

assert.match(production,/gpt-realtime-2\.1/);
assert.match(production,/\/v1\/realtime\/calls/);
assert.doesNotMatch(production,/thebe-voice-eval-panel-v275/);

console.log("PASS: V275 voice evaluation cockpit is owner-only, compact, app-scoped and production-inert");
