import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  BOTSWANA_FOUNDATION_PACK_V1,
  BOTSWANA_FOUNDATION_PACK_V1_HASH
} from "../cloudflare/src/generated/foundation-pack-v1.js";

const source=JSON.parse(fs.readFileSync("cloudflare/seeds/botswana-foundation-pack-v1.json","utf8"));
const meta=JSON.parse(fs.readFileSync("cloudflare/config/foundation-pack-v1.meta.json","utf8"));
const generator=fs.readFileSync("scripts/generate-foundation-pack.mjs","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

const contentHash=crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
const allowedConfidence=new Set(["low","medium","high"]);

assert.equal(source.version,"1.6");
assert.deepEqual(BOTSWANA_FOUNDATION_PACK_V1,source);
assert.equal(BOTSWANA_FOUNDATION_PACK_V1_HASH,contentHash);
assert.equal(meta.importIdentityHash,contentHash);
assert.match(meta.note,/source\/meta drift/i);

for(const rule of source.rules){
  assert.ok(allowedConfidence.has(String(rule.confidence||"medium")),`invalid confidence ${rule.key}: ${rule.confidence}`);
}
const payeAnnual=source.rules.find(rule=>rule.key==="paye-annual-return");
assert.ok(payeAnnual);
assert.equal(payeAnnual.confidence,"medium");
assert.ok(!JSON.stringify(source).includes("operator_confirmed"));

assert.match(generator,/createHash\("sha256"\)/);
assert.match(generator,/Foundation pack source\/meta drift/);
assert.match(generator,/Foundation pack rule confidence is invalid/);
assert.match(worker,/foundation_invalid_confidence/);
assert.match(worker,/\["low","medium","high"\]\.includes\(confidence\)/);
assert.match(packageJson.scripts["config:generate"]||"",/generate-foundation-pack\.mjs/);
assert.match(packageJson.scripts["test:regulatory-pack-v180"]||"",/v180-regulatory-pack-integrity\.mjs/);
assert.ok(packageJson.scripts["test:release-regressions"].startsWith("node tests/v180-regulatory-pack-integrity.mjs && "));

console.log("V180_REGULATORY_PACK_INTEGRITY_PASS");
