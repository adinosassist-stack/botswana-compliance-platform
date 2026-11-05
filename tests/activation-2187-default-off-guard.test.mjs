import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const production = readFileSync(new URL("../cloudflare/wrangler.toml", import.meta.url), "utf8");
const generalStaging = readFileSync(new URL("../cloudflare/wrangler.general-ai-staging.toml", import.meta.url), "utf8");
const exportSafety = readFileSync(new URL("../docs/ai-export-private-safety-consolidation-20261103.md", import.meta.url), "utf8");
const popMigration = readFileSync(new URL("../cloudflare/migrations/071_payment_pop_runtime_compat.sql", import.meta.url), "utf8");

function exactPlainTextFlag(source, name, expected) {
  const matches = [...source.matchAll(new RegExp("^\\s*" + name + "\\s*=\\s*\\\"([^\\\"]*)\\\"\\s*(?:#.*)?$", "gm"))];
  assert.equal(matches.length, 1, name + " must have exactly one plain-text setting");
  assert.equal(matches[0][1], expected, name + " changed without activation qualification");
}

test("production AI, exports and POP activation remain explicitly disabled", () => {
  for (const name of ["THEBE_GENERAL_AI_ENABLED", "THEBE_AI_EXPORTS_ENABLED", "POP_UPLOAD_STAGING_ENABLED"]) {
    exactPlainTextFlag(production, name, "false");
  }
  exactPlainTextFlag(production, "PAYMENT_PROVIDER", "none");
});

test("private General AI staging remains disabled and not internet-exposed", () => {
  exactPlainTextFlag(generalStaging, "THEBE_GENERAL_AI_ENABLED", "false");
  exactPlainTextFlag(generalStaging, "THEBE_GENERAL_AI_RESEARCH_ENABLED", "false");
  assert.match(generalStaging, /^\\s*workers_dev\\s*=\\s*false\\s*$/m);
  assert.match(generalStaging, /^\\s*preview_urls\\s*=\\s*false\\s*$/m);
  assert.doesNotMatch(generalStaging, /^\\s*(?:route|routes|zone_id)\\s*=/m);
  assert.match(generalStaging, /database_id\\s*=\\s*"ff229eef-7724-49ae-9d68-d3a1db669b63"/);
  assert.match(generalStaging, /namespace_id\\s*=\\s*"78212078"/);
});

test("AI export reference implementation explicitly remains unmounted", () => {
  assert.match(exportSafety, /unmounted/i);
  assert.match(exportSafety, /no production user-facing export workflow is activated/i);
});

test("POP schema compatibility migration does not settle payment or activate subscriptions", () => {
  assert.doesNotMatch(popMigration, /\\b(?:UPDATE|INSERT|DELETE)\\s+(?:INTO\\s+|FROM\\s+)?(?:subscriptions|payment_orders|payment_fulfillments)\\b/i);
});
