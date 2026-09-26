import assert from "node:assert/strict";
import fs from "node:fs";
import {__businessMemoryTest} from "../cloudflare/src/business-memory.js";
import {__moneyIntelligenceTest} from "../cloudflare/src/money-intelligence.js";

assert.equal(__businessMemoryTest.normalizeNamespace("finance"),"finance");
assert.equal(__businessMemoryTest.normalizeNamespace("people"),null);
assert.equal(__businessMemoryTest.normalizeKey("minimum.cash.buffer"),"minimum.cash.buffer");
assert.equal(__businessMemoryTest.normalizeKey("bank_account"),null);
assert.equal(__businessMemoryTest.encodeValue({currency:"BWP"}).ok,true);
assert.equal(__businessMemoryTest.encodeValue([1,2,3]).ok,false);

const rows=[
  {id:"1",posted_on:"2026-09-26",description:"Receipt",reference:"",amount_minor:1000000},
  {id:"2",posted_on:"2026-09-25",description:"Supplier",reference:"",amount_minor:-800000},
  {id:"3",posted_on:"2026-09-10",description:"Rent",reference:"",amount_minor:-300000},
  {id:"4",posted_on:"2026-08-20",description:"Old supplier",reference:"",amount_minor:-400000}
];
const trend=__moneyIntelligenceTest.summarizeTransactions(rows,"2026-09-26");
assert.equal(trend.current30.inflow,1000000);
assert.equal(trend.current30.outflow,1100000);
assert.equal(trend.prior30.outflow,400000);
assert.equal(trend.largeDebits.length,1);
const assumptions=__moneyIntelligenceTest.assumptionMetrics({cashPositionMinor:9000000,memory:{assumptions:{monthlyCashOutflowsBwp:60000,minimumCashBufferBwp:25000}}});
assert.equal(assumptions.estimatedRunwayDays,45);
assert.equal(assumptions.safeDiscretionaryMinor,6500000);
assert.equal(assumptions.authoritative,false);

const migration=fs.readFileSync("cloudflare/migrations/057_v157_business_memory_money_intelligence.sql","utf8");
for(const contract of ["business_memory_items","business_memory_events","owner_confirmed","uq_business_memory_active_key","trg_business_memory_source_immutable"])assert.ok(migration.includes(contract));
const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
assert.match(context,/buildMoneyIntelligence/);
assert.match(context,/listBusinessMemory/);
assert.match(context,/moneyIntelligence/);
assert.match(context,/durableMemory/);
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(worker,/handleBusinessMemoryRequest/);
assert.match(worker,/057_v157_business_memory_money_intelligence\.sql/);
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
assert.match(agentic,/057_v157_business_memory_money_intelligence\.sql/);
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.latest_cloudflare_migration,"057_v157_business_memory_money_intelligence.sql");
assert.equal(profile.business_memory_v157,true);
assert.equal(profile.money_intelligence_v157,true);
console.log("v157 Business Memory + Money Intelligence checks passed");
