import assert from "node:assert/strict";
import fs from "node:fs";

const audit=fs.readFileSync("scripts/production-launch-audit.mjs","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));
const start=audit.indexOf("// v181 regulatory activation diagnostic begin");
const end=audit.indexOf("// v181 regulatory activation diagnostic end");
assert.ok(start>=0&&end>start);
const block=audit.slice(start,end);

for(const label of [
  "platform_regulatory_principals",
  "regulatory_pack_imports",
  "regulatory_sources",
  "regulatory_rules",
  "regulatory_conflicts",
  "maker_checker_ready=",
  "pack_imported=",
  "pack_completed=",
  "sources_verified_approved=",
  "rules_draft=",
  "rules_published=",
  "open_conflicts="
]) assert.ok(block.includes(label),`missing activation diagnostic: ${label}`);

assert.match(block,/REGULATORY_FOUNDATION_PACK_KEY='botswana-foundation-v1'/);
assert.match(block,/regulatory_pack_imports WHERE pack_key=\?/);
assert.match(block,/\[REGULATORY_FOUNDATION_PACK_KEY\]/);
assert.match(block,/packCompleted:!!regulatoryImport&&String\(regulatoryImport\.status\|\|''\)==='completed'/);
assert.ok(block.includes("'not_initialized'"));
assert.ok(block.includes("'pack_import_incomplete'"));
assert.ok(block.includes("'maker_checker_required'"));
assert.ok(block.includes("'source_review_required'"));
assert.ok(block.includes("'rule_review_required'"));
assert.ok(block.includes("'active_with_conflicts'"));
assert.ok(block.includes("'active'"));
assert.doesNotMatch(block,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
assert.doesNotMatch(block,/SELECT\s+[^\n;]*\bemail\b/i);
assert.match(audit,/refusing non-read-only D1 audit query/);
assert.match(packageJson.scripts["test:regulatory-activation-v181"]||"",/v181-regulatory-activation-audit\.mjs/);

const chain=packageJson.scripts["test:release-regressions"]||"";
const v180="node tests/v180-regulatory-pack-integrity.mjs";
const v181="node tests/v181-regulatory-activation-audit.mjs";
const credential="node tests/v179-property-valuer-credential-binding.mjs";
const coverage="node tests/v179-compliance-coverage-truth.mjs";
assert.ok(chain.startsWith(v180+" && "+v181+" && "));
assert.ok(chain.indexOf(v181)<chain.indexOf(credential));
assert.ok(chain.indexOf(credential)<chain.indexOf(coverage));

console.log("V181_REGULATORY_ACTIVATION_AUDIT_PASS");
