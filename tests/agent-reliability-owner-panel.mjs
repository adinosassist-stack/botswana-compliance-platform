import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(source,/reliability\.id="ownerReliabilityPanel"/);
assert.match(source,/\/api\/ai\/operator\/reliability\?days=7/);
assert.doesNotMatch(source,/reliability\?[^"']*tenant/i);
assert.match(source,/payload\?\.mode!=="advisor_only"/);
assert.match(source,/payload\?\.canMutate!==false/);
assert.match(source,/if\(!canEdit\(\)\|\|!reliability\.open/);
assert.match(source,/Cost telemetry never proves task success/);
assert.match(source,/Unverified runs are never counted as successful/);
assert.match(source,/summary\.status==="evaluated"&&total>0/);
assert.match(source,/summary\.total\|\|0/);
assert.match(source,/summary\.counts\?\.success\|\|0/);
assert.doesNotMatch(source,/summary\.totalRuns|summary\.reliabilityScore/);
assert.match(source,/:"—"/);
assert.doesNotMatch(source,/autofix|auto[- ]?fix|mutate agent|apply recommendation/i);
assert.match(source,/Recommendation-only improvements/);

assert.match(source,/const activeCompany=q\("#companySelect"\)\?\.value\|\|""/);
assert.match(source,/!==activeCompany\)return/);
assert.match(source,/!reliability\.open/);
assert.match(source,/const requestSeq=\+\+reliabilityRequestSeq/);
assert.match(source,/requestSeq!==reliabilityRequestSeq/);
console.log("owner reliability panel contract passed");
