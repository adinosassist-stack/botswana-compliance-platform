import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__thebeLanguageTest as language} from "../cloudflare/src/thebe-language.js";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";
import {__businessContextTest as contextTest} from "../cloudflare/src/business-context.js";

for(const path of [
  "cloudflare/src/thebe-language.js",
  "cloudflare/src/money-intelligence.js",
  "cloudflare/src/business-context.js",
  "cloudflare/src/agentic-core.js",
  "cloudflare/src/agentic-whatsapp-core.js",
  "cloudflare/src/agentic-live-voice.js",
  "cloudflare/src/worker.js",
  "public/js/owner-command-centre.js",
  "cloudflare/src/production-entry.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.equal(language.normalizeThebeLanguage("tn"),"setswana");
assert.equal(language.normalizeThebeLanguage("Sekalaka"),"sekalaka");
assert.equal(language.normalizeThebeLanguage("unknown"),null);
const setswanaPref=language.languagePreferenceFromMemory({items:[{namespace:"language",key:"primary",value:"setswana"}]});
assert.equal(setswanaPref.primary,"setswana");
assert.match(language.thebeLanguagePrompt(setswanaPref,"typed-chat"),/Support English, Setswana, and Sekalaka/);
assert.match(language.thebeLanguagePrompt(setswanaPref,"typed-chat"),/owner-confirmed preferred language is Setswana/);
const sekalakaPref=language.languagePreferenceFromMemory({items:[{namespace:"language",key:"primary",value:"sekalaka"}]});
assert.equal(language.deterministicLanguagePolicy(sekalakaPref).render,"english");
assert.equal(language.deterministicLanguagePolicy(sekalakaPref).fallback,true);
assert.match(language.deterministicLanguageNotice(sekalakaPref),/stays in English/);

const assumptions=money.assumptionMetrics({
  cashPositionMinor:9000000,
  memory:{assumptions:{
    monthlyCashOutflowsBwp:60000,
    minimumCashBufferBwp:25000,
    plannedPurchaseBwp:70000,
    plannedPurchaseLabel:"Equipment",
    monthlyLabourCostBwp:15000,
    monthlyRevenueTargetBwp:120000,
    sameMonthCollectionPct:50
  }}
});
assert.equal(assumptions.plannedPurchaseMinor,7000000);
assert.equal(assumptions.monthlyLabourCostMinor,1500000);
assert.equal(assumptions.monthlyRevenueTargetMinor,12000000);
assert.equal(assumptions.sameMonthCollectionPct,50);

const scenario=money.cashScenario({
  cashPositionMinor:9000000,
  trend:{current30:{inflow:3000000,outflow:6000000}},
  assumptions,
  receivablesOutstandingMinor:2000000
});
assert.equal(scenario.formalForecast,false);
assert.equal(scenario.accountingMargin,false);
assert.equal(scenario.receivableCollectionTreatment,"separate_upside_not_added_to_base_scenario");
const day30=scenario.horizons.find(item=>item.days===30);
assert.equal(day30.ownerAssumptionEndingCashMinor,6000000);
assert.equal(day30.ownerCollectionUpsideMinor,1000000);
assert.equal(day30.ownerAssumptionEndingCashWithCollectionMinor,7000000);
assert.equal(scenario.cashFlowMarginProxyPct,-1);
assert.equal(scenario.monthlyRevenueTargetCoveragePct,0.25);

const commitments=money.ownerCommitments(assumptions);
assert.equal(commitments.authoritative,false);
assert.equal(commitments.totalUntimedOneOffMinor,7000000);
assert.ok(commitments.items.some(item=>item.type==="planned_purchase"));
assert.ok(commitments.items.some(item=>item.type==="monthly_labour_cost_assumption"));

const concentration=money.debitConcentration([
  {descriptor:"supplier a",transaction_count:4,total_outflow_minor:4200000}
],6000000);
assert.equal(concentration[0].transactionCount,4);
assert.equal(concentration[0].shareOfCurrent30Outflow,0.7);
assert.equal(concentration[0].identityConfidence,"description_only_not_supplier_verified");

const merged=contextTest.mergeConfirmedMemory(
  {assumptions:{}},
  {items:[
    {namespace:"finance",key:"planned_purchase_bwp",value:70000},
    {namespace:"business",key:"planned_purchase_label",value:"Equipment"}
  ]}
);
assert.equal(merged.assumptions.plannedPurchaseBwp,70000);
assert.equal(merged.assumptions.plannedPurchaseLabel,"Equipment");

const brief=contextTest.buildDailyBusinessBrief({
  observedAt:"2026-09-26T12:00:00.000Z",
  businessDate:"2026-09-26",
  language:setswanaPref,
  finance:{
    cashPositionMinor:9000000,
    reconciliation:{unresolvedCount:0,unresolvedExposureMinor:0,stale:false},
    receivables:{outstandingMinor:2000000,overdueMinor:0,overdueInvoiceCount:0},
    today:{positiveInflowMinor:0,customerCollectionMinor:0}
  },
  operations:{pendingWorkflowCount:0,failedWorkflowCount:0,criticalPerformanceSignals:0},
  compliance:{overdueCount:0,dueWithin14Days:0},
  sales:{dormantQuotationCount:0,dormantQuotationValueBwp:0},
  moneyIntelligence:{available:true,trend:{current30:{inflow:3000000,outflow:6000000,net:-3000000},largeDebits:[]},assumptions,scenario,commitments,debitConcentrations:concentration,signals:[]},
  durableMemory:{items:[]},
  provenance:{authoritative:["finance_transactions"],ownerEntered:["business_memory_items"]}
});
assert.equal(brief.language.deterministic.render,"setswana");
assert.match(contextTest.businessBriefText(brief),/Kakaretso ya kgwebo/);
assert.equal(brief.authority.executionAllowed,false);
assert.equal(brief.authority.runtimeGuardBypassed,false);

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const agent=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
const whatsapp=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
const voice=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const moneySource=fs.readFileSync("cloudflare/src/money-intelligence.js","utf8");

assert.match(worker,/LANGUAGE_POLICY/);
assert.match(worker,/thebeLanguagePrompt/);
assert.match(agent,/LANGUAGE_POLICY/);
assert.match(agent,/thebeLanguagePrompt/);
assert.match(whatsapp,/loadThebeLanguagePreference/);
assert.match(whatsapp,/deterministicLanguagePolicy/);
assert.match(voice,/sharedLanguageGuidance/);
assert.match(owner,/30-day cash scenario/);
assert.match(owner,/Cash-flow margin proxy/);
assert.match(owner,/Planned commitments/);
assert.match(owner,/Debit concentration/);
assert.match(production,/OWNER_COMMAND_CENTRE_RELEASE="20260926-v160"/);
assert.match(moneySource,/formalForecast:false/);
assert.match(moneySource,/accountingMargin:false/);
assert.match(moneySource,/description_only_not_supplier_verified/);
assert.match(moneySource,/receivableCollectionTreatment:"separate_upside_not_added_to_base_scenario"/);
assert.doesNotMatch(moneySource,/executionAllowed:true/);
assert.doesNotMatch(agent,/globalExecutionEnabled:true/);

const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.language_parity_v160,true);
assert.equal(profile.money_intelligence_v2,true);
assert.deepEqual(profile.money_intelligence_scenario_horizons_days,[7,30,90]);
assert.equal(profile.money_intelligence_formal_forecast_claimed,false);
assert.equal(profile.money_intelligence_accounting_margin_claimed,false);
assert.equal(profile.money_intelligence_supplier_identity_claimed,false);
assert.equal(profile.v160_execution_authority_expanded,false);

console.log("v160 language parity + Money Intelligence v2 checks passed");
