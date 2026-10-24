import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  BOTSWANA_FOUNDATION_PACK_V1,
  BOTSWANA_FOUNDATION_PACK_V1_HASH
} from "../cloudflare/src/generated/foundation-pack-v1.js";

const seed=JSON.parse(fs.readFileSync(new URL("../cloudflare/seeds/botswana-foundation-pack-v1.json",import.meta.url),"utf8"));
const meta=JSON.parse(fs.readFileSync(new URL("../cloudflare/config/foundation-pack-v1.meta.json",import.meta.url),"utf8"));
const hash=crypto.createHash("sha256").update(JSON.stringify(seed)).digest("hex");
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
assert.match(worker,/if\(!Number\.isInteger\(Number\(action\.dueDaysAfterPeriodEnd\)\)\|\|Number\(action\.dueDaysAfterPeriodEnd\)<1\)return out;/);
assert.ok(!worker.includes("action.dueDaysAfterPeriodEnd||25"),"VAT scheduler must not silently default to legacy 25 days");
assert.ok(worker.includes('missing.push("dueDaysAfterPeriodEnd")'),"missing VAT period deadline must surface as needs_input");
assert.match(worker,/legacyVatDeadline=String\(row\.rule_key\|\|""\)==="bw\.burs\.vat\.return-payment\.25-days"/);
assert.match(worker,/coversCurrentVatPeriods=!row\.effective_to\|\|String\(row\.effective_to\)\.slice\(0,10\)>="2026-07-01"/);
assert.match(worker,/if\(legacyVatDeadline&&coversCurrentVatPeriods\)return json\(\{error:"vat_2026_legacy_deadline_blocked"/);
assert.ok(worker.includes('if(["approved","published"].includes(next)){'),"legacy VAT guard must be inside governed approval/publication path");
const source=key=>seed.sources.find(item=>item.key===key);
const rule=key=>seed.rules.find(item=>item.key===key);

assert.equal(seed.version,"1.8");
assert.equal(seed.asOf,"2026-10-24");
assert.equal(seed.sources.length,24);
assert.equal(seed.rules.length,16);
assert.deepEqual(BOTSWANA_FOUNDATION_PACK_V1,seed);
assert.equal(BOTSWANA_FOUNDATION_PACK_V1_HASH,hash);
assert.equal(meta.importIdentityHash,hash);

const sourceKeys=new Set(seed.sources.map(item=>item.key));
assert.equal(sourceKeys.size,seed.sources.length,"duplicate seed source key");
assert.equal(new Set(seed.sources.map(item=>item.url)).size,seed.sources.length,"duplicate source URL");
for(const item of seed.rules){
  assert.ok(Array.isArray(item.sourceKeys)&&item.sourceKeys.length, `rule missing evidence: ${item.key}`);
  for(const key of item.sourceKeys)assert.ok(sourceKeys.has(key),`unknown evidence ${key} for ${item.key}`);
  assert.ok(!["approved","published"].includes(item.status),`seed must never pre-approve ${item.key}`);
}

const vat=rule("vat-return-payment");
assert.ok(vat);
assert.equal(vat.ruleKey,"bw.burs.vat.return-payment.28-days");
assert.equal(vat.effectiveFrom,"2026-07-01");
assert.equal(vat.action.operationalization,"vat_category_period");
assert.equal(vat.action.dueDaysAfterPeriodEnd,28);
assert.deepEqual(vat.sourceKeys,["burs-vat-act-2026"]);
assert.match(vat.summary,/sections 54, 65 and 66/);
assert.match(vat.action.obligation.description,/Historical or transitional periods require independent review/);
assert.equal(seed.rules.some(item=>/vat\.return-payment\.25-days/i.test(item.ruleKey)),false,
  "superseded VAT 25-day rule must never ship in current foundation seed");
assert.match(source("burs-vat-act-2026").url,/value-added-tax-act-2026/i);
assert.match(source("burs-vat-act-2026").notes,/28 days/);
assert.match(source("burs-payments").notes,/historical and superseded/);
assert.ok(!vat.sourceKeys.includes("burs-payments"),"legacy payment table cannot control 2026 VAT deadlines");
assert.ok(!vat.sourceKeys.includes("burs-vat-category-regulations"),"superseded subsidiary category source cannot control 2026 categories");

const paye=rule("paye-remittance");
assert.equal(paye.action.dueDaysAfterPeriodEnd,15);
assert.deepEqual(paye.sourceKeys,["burs-payments"]);

const industrial=rule("industrial-annual-fee");
assert.deepEqual(industrial.sourceKeys,["industrial-licence-eservices"]);
assert.equal(industrial.confidence,"medium");
assert.match(industrial.summary,/reconciliation/);
assert.match(source("industrial-licence-eservices").url,/trade\.gov\.bw\/Home\/Applications\?DeptId=7/);
assert.match(source("industrial-licence-eservices").notes,/25% annual fee/);
assert.match(source("industrial-licence-gov").notes,/annual renewal/);

const egp=source("botswana-egp-procurement-2026");
assert.ok(egp);
assert.ok(!Object.hasOwn(egp,"publicationDate"),"unverified 2026 publication date cannot be silently asserted");
assert.match(egp.notes,/unverified/);
assert.match(egp.notes,/before approval/);

const vatThreshold=seed.conflicts.find(item=>item.key==="vat-registration-threshold");
assert.equal(vatThreshold.status,"resolved");
assert.ok(vatThreshold.sourceKeys.includes("burs-vat-act-2026"));
assert.equal(seed.rules.some(item=>/vat-compulsory-threshold|paye-itw8-threshold/.test(item.key)),false);
for(const key of ["burs-vat-faq-500k","burs-income-faq-3000","burs-tax-faq-pdf-2500"]){
  assert.ok(source(key)?.notes.match(/Legacy|stale|provenance/i),`stale source not tagged: ${key}`);
}
console.log("REGULATORY_2026_SOURCE_PRECEDENCE_AND_PACK_INTEGRITY_PASS");
