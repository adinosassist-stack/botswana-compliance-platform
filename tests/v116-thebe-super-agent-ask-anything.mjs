import assert from "node:assert/strict";
import fs from "node:fs";

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(worker,/You are Thebe, the single governed business super agent/);
assert.match(worker,/mode==="ask"/);
assert.match(worker,/stable general knowledge and reasoning/);
assert.match(worker,/Never present general knowledge as a fact about this company/);
assert.match(worker,/company-specific claim/);
assert.match(worker,/live external information, current law, current market prices, current news/);
assert.match(worker,/do not claim or imply that the action was executed/);
assert.match(worker,/general-knowledge answers may use an empty sourceRefs array/);
assert.match(worker,/The governed AI answer service is unavailable/);

assert.match(owner,/Thebe AI · Super Agent/);
assert.match(owner,/Ask Thebe/);
assert.match(owner,/ownerThebeQuestion/);
assert.match(owner,/\/api\/ai\/advisor/);
assert.match(owner,/mode:"ask"/);
assert.match(owner,/Company facts stay tenant-scoped/);
assert.match(owner,/general knowledge is never presented as company data/);
assert.match(owner,/Answer ready · no action was executed/);

assert.doesNotMatch(owner,/fetch\s*\(/,"Ask Thebe UI must use the secure first-party API client");
assert.doesNotMatch(worker,/mode==="ask"[\s\S]{0,1200}(?:payment\.execute|journal_entry\.post)/,"Ask mode must not gain a direct high-impact execution path");

console.log("Thebe Super Agent free-form Q&A guardrails: PASS");
