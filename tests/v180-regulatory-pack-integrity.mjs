import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  BOTSWANA_FOUNDATION_PACK_V1,
  BOTSWANA_FOUNDATION_PACK_V1_HASH
} from "../cloudflare/src/generated/foundation-pack-v1.js";
import {
  normalizeRegulatoryRuleInsertSql,
  withRegulatoryRuleInsertFix
} from "../cloudflare/src/regulatory-rule-insert-sql-fix.js";

const source=JSON.parse(fs.readFileSync("cloudflare/seeds/botswana-foundation-pack-v1.json","utf8"));
const meta=JSON.parse(fs.readFileSync("cloudflare/config/foundation-pack-v1.meta.json","utf8"));
const generator=fs.readFileSync("scripts/generate-foundation-pack.mjs","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const agenticEntry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");

const contentHash=crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
const allowedConfidence=new Set(["low","medium","high"]);

assert.equal(source.version,"1.8");
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

const malformedRuleInsert="INSERT INTO regulatory_rules(id,rule_key,version,title,summary,applicability,action,source_ids,effective_from,effective_to,status,confidence,created_by_user_id,definition_hash,supersedes_rule_id) VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)";
const correctedRuleInsert="INSERT INTO regulatory_rules(id,rule_key,version,title,summary,applicability,action,source_ids,effective_from,effective_to,status,confidence,created_by_user_id,definition_hash,supersedes_rule_id) VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)";
assert.equal(normalizeRegulatoryRuleInsertSql(malformedRuleInsert),correctedRuleInsert);
assert.equal((normalizeRegulatoryRuleInsertSql(malformedRuleInsert).match(/\?/g)||[]).length,14);
assert.equal(normalizeRegulatoryRuleInsertSql(correctedRuleInsert),correctedRuleInsert);
assert.equal(normalizeRegulatoryRuleInsertSql("SELECT 1"),"SELECT 1");

const prepared=[];
const fakeDb={
  prepare(sql){prepared.push(sql);return {sql}},
  exec(){return "delegated"}
};
const guardedDb=withRegulatoryRuleInsertFix(fakeDb);
guardedDb.prepare(malformedRuleInsert);
assert.equal(prepared[0],correctedRuleInsert);
assert.equal(guardedDb.exec(),"delegated");

assert.match(wrangler,/main\s*=\s*"src\/release-governance-entry\.js"/);
assert.match(agenticEntry,/\.\/regulatory-rule-insert-sql-fix\.js/);
assert.match(agenticEntry,/withRegulatoryRuleInsertFix/);
assert.match(agenticEntry,/env=withRegulatorySqlGuard\(env\);/);
assert.match(agenticEntry,/base\.fetch\(request,env,ctx\)/);
assert.match(agenticEntry,/async scheduled\(event,env,ctx\)\{\s*env=withRegulatorySqlGuard\(env\);\s*\/\/[^\n]*\s*if\(event\.cron==="\* \* \* \* \*"\)\{\s*ctx\.waitUntil\(runEmployeeDispatchSweep\(env\)\.catch\(\(\)=>console\.error\("employee_dispatch_unavailable"\)\)\);\s*return;\s*\}\s*ctx\.waitUntil\(runDueInternalAutonomy\(env\)\.catch\(\(\)=>console\.error\("internal_autonomy_run_unavailable"\)\)\);\s*return base\.scheduled\(event,env,ctx\);\s*\}/);

console.log("V180_REGULATORY_PACK_INTEGRITY_PASS");
