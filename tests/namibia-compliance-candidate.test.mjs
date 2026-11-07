import assert from "node:assert/strict";
import test from "node:test";
import { NAMIBIA_CANDIDATE, namibiaCandidateActivationReadiness } from "../cloudflare/src/namibia-compliance-candidate.js";
import { marketActivationReadiness, marketRollout } from "../cloudflare/src/market-profile.js";
import { regulatoryPackBundleForMarket } from "../cloudflare/src/regulatory-pack-registry.js";

test("Namibia candidate contains sourced, distinct review-only domains", () => {
  assert.equal(NAMIBIA_CANDIDATE.marketCode, "NA");
  assert.equal(NAMIBIA_CANDIDATE.productionEnabled, false);
  assert.equal(NAMIBIA_CANDIDATE.status, "research_candidate");
  assert.equal(NAMIBIA_CANDIDATE.reviewedBy, null);
  assert.equal(NAMIBIA_CANDIDATE.approvedAt, null);
  assert.deepEqual(NAMIBIA_CANDIDATE.domains.map(d => d.key), [
    "bipa_annual_returns", "bipa_beneficial_ownership", "namra_vat", "fic_aml"
  ]);
  for (const domain of NAMIBIA_CANDIDATE.domains) {
    assert.equal(domain.deadlinePolicy, "review_required");
    assert.ok(domain.source.startsWith("https://"));
    assert.ok(domain.evidence.length > 0);
    assert.notEqual(domain.automation, "auto_submit");
  }
});

test("Namibia cannot activate or replace Botswana runtime", () => {
  const readiness = namibiaCandidateActivationReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.length >= 4);
  assert.equal(marketActivationReadiness("NA").ready, false);
  assert.equal(regulatoryPackBundleForMarket("NA"), null);
  assert.equal(marketActivationReadiness("BW").ready, true);
  assert.ok(regulatoryPackBundleForMarket("BW"));
  assert.deepEqual(marketRollout(), { live: ["BW"], next: ["NA"] });
});
