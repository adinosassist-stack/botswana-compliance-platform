import assert from "node:assert/strict";

const origin = String(process.env.PROPERTY_ORIGIN || "https://thebedesk.com").replace(/\/+$/, "");
const expectedRelease = "20261001-property-visibility-v226";
const runtimePath = "/js/workspace-runtime-20261001b.js";
const fragmentPath = `/assets/workspace-view-fragments-20261001a-4.json?v=${expectedRelease}`;

async function fetchText(path) {
  const url = `${origin}${path}${path.includes("?") ? "&" : "?"}live_proof=${Date.now()}`;
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "ThebeDesk-V227-Property-Live-Proof/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `${path} must return HTTP 200; got ${response.status}`);
  const body = await response.text();
  assert.ok(body.length > 0, `${path} must return a non-empty body`);
  return { body, response, url };
}

const runtime = await fetchText(runtimePath);
assert.match(runtime.body, /PROPERTY_VIEW_FRAGMENT_ASSET="\/assets\/workspace-view-fragments-20261001a-4\.json\?v=20261001-property-visibility-v226"/, "live runtime must point Property at the V226 shared fragment transport");
assert.match(runtime.body, /cacheKey=propertyView\?"property-v226":String\(shard\)/, "live runtime must use the V226 Property cache identity");

const fragment = await fetchText(fragmentPath);
let shard;
try {
  shard = JSON.parse(fragment.body);
} catch (error) {
  throw new Error(`live Property fragment must be valid JSON: ${error.message}`);
}
assert.equal(shard.schema, 2, "live Property fragment schema must be 2");
assert.equal(shard.shard, 4, "live Property fragment must be shard 4");
const property = String(shard.views?.propertyintelligence || "");
assert.match(property, /Compact Property Calculator/, "live Property view must expose Compact Property Calculator");
assert.match(property, /property-calculator-v224/, "live Property view must retain the compact reference-style design");
assert.match(property, /id="propertyPurchasePrice"/, "live Property view must contain the purchase-price input");
assert.match(property, /id="propertyMonthlyRent"/, "live Property view must contain the monthly-rent input");
assert.match(property, /property-analyse-button/, "live Property view must contain the Analyse action");
assert.match(property, /id="propertyDealResults"/, "live Property view must contain the results surface");
assert.match(property, /not a professional property valuation/, "live Property view must preserve the valuation boundary");

const proof = {
  origin,
  runtime: runtimePath,
  fragment: fragmentPath,
  propertyRelease: expectedRelease,
  calculatorVisible: true,
  runtimeCacheControl: runtime.response.headers.get("cache-control"),
  fragmentCacheControl: fragment.response.headers.get("cache-control"),
  runtimeCfRay: runtime.response.headers.get("cf-ray"),
  fragmentCfRay: fragment.response.headers.get("cf-ray"),
};
console.log(JSON.stringify(proof, null, 2));
console.log("V227_PROPERTY_LIVE_PROOF_PASS");
