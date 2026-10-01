import fs from "node:fs";
import assert from "node:assert/strict";

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const dock=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const css=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");

assert.match(worker,/type:"official_source"[\s\S]{0,220}verificationStatus:x\.verificationStatus/,
  "official-source references must carry deterministic server verification status to the dock");

const trustStart=dock.indexOf("function advisorTrust");
const trustEnd=dock.indexOf("function runSummaryCell",trustStart);
assert(trustStart>=0&&trustEnd>trustStart,"V225 advisor trust helper must exist");
const trust=dock.slice(trustStart,trustEnd);
assert.match(trust,/item\?\.type==="official_source"/,
  "Verified must be based on official sources rather than arbitrary workspace references");
assert.match(trust,/verificationStatus\|\|""\)\.toLowerCase\(\)==="verified"/,
  "Verified must require explicit verified status from the server");
assert.match(trust,/references\.length>0&&references\.length===official\.length&&verifiedOfficial\.length===official\.length/,
  "Verified requires an official-only cited evidence set and every cited official source must be verified");
assert.doesNotMatch(trust,/confidence/,
  "AI confidence must never be used as a verification signal");
assert.match(trust,/key:"grounded"/);
assert.match(trust,/key:"advisory"/);

assert.match(dock,/runSummaryCell\("Goal"/);
assert.match(dock,/runSummaryCell\("Evidence"/);
assert.match(dock,/runSummaryCell\("Plan"/);
assert.match(dock,/lastGoal=q[\s\S]{0,120}lastAdvisorTrust="working"/,
  "request intent must be retained while Thebe works");
assert.match(dock,/mascotState==="thinking"[\s\S]{0,120}label:"Working"/,
  "thinking must expose a concise Working state");
assert.match(dock,/mascotState==="approval"[\s\S]{0,120}label:"Waiting for you"/,
  "approval must expose an explicit owner handoff");
assert.match(dock,/if\(pending\)return \{stage:4,tone:"review",label:`Waiting for you/,
  "pending owner reviews must remain authoritative for Waiting for you");
assert.match(dock,/mascotState==="success"[\s\S]{0,180}lastAdvisorTrust==="verified"[\s\S]{0,120}label:"Verified"/,
  "successful verified-source runs may expose Verified");
assert.match(dock,/Answer only · no action executed/,
  "read-only answers must state that no action was executed");

assert.match(css,/V225 governed run summary/);
assert.match(css,/\.thebe-ai-run-grid\{[\s\S]{0,160}grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "Goal, Evidence and Plan must remain compact rather than becoming a tall stack");
assert.match(css,/data-trust="verified"/);
assert.match(css,/data-trust="grounded"/);
assert.match(css,/data-trust="advisory"/);
assert.doesNotMatch(css,/V225 governed run summary[\s\S]*gradient\(/i,
  "V225 must preserve the flat no-gradient dock language");

console.log("PASS: V225 Thebe dock exposes truthful Goal/Evidence/Plan and governed Working/Waiting/Verified states.");
