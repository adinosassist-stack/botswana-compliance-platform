import assert from "node:assert/strict";
import fs from "node:fs";

const money=fs.readFileSync("public/js/daily-report-money-v331.js","utf8");
const reporter=fs.readFileSync("public/js/reporter-money-v331.js","utf8");
const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const redirect=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");

assert.match(money,/api\/daily-reporting\/dashboard\?date=/);
assert.match(money,/Overall reported revenue/);
assert.match(money,/Revenue by branch/);
assert.match(money,/reported operational data/i);
assert.match(money,/api\/finance\/connections/);
assert.match(money,/fnb_bw_business/);
assert.match(money,/Read-only connection/);
assert.match(reporter,/Cash sales \(P\)/);
assert.match(reporter,/Card \/ mobile money \(P\)/);
assert.match(reporter,/Customer deposits \(P\)/);
assert.match(reporter,/reporterRevenue/);
assert.match(reporter,/reported operational revenue/i);
assert.match(readiness,/daily-report-money-v331\.js/);
assert.match(redirect,/reporter-money-v331\.js/);
assert.match(finance,/fnb_bw_business/);
assert.match(finance,/readOnly:true/);
assert.match(finance,/credentialStorage:"external"/);
assert.match(finance,/secretMaterialStored:false/);
assert.match(finance,/moneyMovement:false/);
assert.match(worker,/revenueBwp:numericReportKpi/);
assert.match(worker,/branches=locIds\.map/);
assert.match(worker,/totals,previousTotals/);

console.log("v331 report money and FNB read-only surface contract PASS");
