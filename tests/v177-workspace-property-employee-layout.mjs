import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(html,/class="nav-primary" data-view="propertyintelligence"/,"Property must be a first-class primary workspace destination");
assert.equal((html.match(/data-view="propertyintelligence"/g)||[]).length,1,"Property navigation must have one canonical control");
assert.doesNotMatch(html,/class="nav-advanced" data-view="propertyintelligence"/,"Property must not be hidden in advanced navigation");

const moneyStart=html.indexOf('<section id="moneyhub"');
const propertyStart=html.indexOf('<section id="propertyintelligence"',moneyStart);
assert.ok(moneyStart>0&&propertyStart>moneyStart,"Money and Property workspace sections must exist");
const moneySection=html.slice(moneyStart,propertyStart);
assert.doesNotMatch(moneySection,/Property Intelligence|propertyintelligence/i,"Money must not surface or route into Property Intelligence");
assert.match(html,/propertyintelligence:\["Property Intelligence","Property","property real estate rental yield mortgage cash flow investment"\]/,"Property Intelligence must be classified under Property, not Money");
assert.doesNotMatch(html,/Money · Investments/,"Property workspace must not present itself as a Money sub-area");
assert.doesNotMatch(html,/showView\('moneyhub'\)">Back to Money/,"Property workspace must not route back to Money");
const propertyFragments=[
  fs.readFileSync(new URL("../public/assets/workspace-view-fragments-20260929g.json",import.meta.url),"utf8"),
  fs.readFileSync(new URL("../public/assets/workspace-view-fragments-20260929g-4.json",import.meta.url),"utf8")
];
for(const source of propertyFragments){
  assert.doesNotMatch(source,/Money · Investments|Back to Money/,"lazy Property fragments must preserve the Property/Money separation");
}

const ownerCentre=fs.readFileSync(new URL("../public/js/owner-command-centre.js",import.meta.url),"utf8");
assert.match(ownerCentre,/function openPropertyValuationServiceRequest\(item\)/,"active property cards must have a contextual valuation-service entry helper");
assert.match(ownerCentre,/button\("Request valuation quote",\(\)=>openPropertyValuationServiceRequest\(item\),"btn"\)/,"active owner property cards must expose the valuation quote CTA");
assert.match(ownerCentre,/const select=q\("#portfolioValuationServiceProperty"\)/,"contextual quote CTA must bind to the canonical valuation-service property selector");
assert.match(ownerCentre,/Property selected\. Add the request details, then request a quote\./,"contextual quote CTA must explain the next conversion step");
assert.match(ownerCentre,/panel\.scrollIntoView\(\{behavior:"smooth",block:"center"\}\)/,"contextual quote CTA must move the user to the valuation-service form");
assert.match(ownerCentre,/shell\.className="card property-portfolio-workspace"/,'Property portfolio must expose the V180 presentation hook');
assert.match(ownerCentre,/servicePanel\.className="card property-valuation-service-card"/,'professional valuation service must expose the prominent service-card hook');
assert.match(ownerCentre,/shell\.insertBefore\(servicePanel,forms\)/,'professional valuation service must appear before lower-priority property setup forms');


const createStart=html.indexOf("async function addEmployeeRecord()");
const removeStart=html.indexOf("async function removeEmployeeRecord(",createStart);
assert.ok(createStart>0&&removeStart>createStart,"employee mutation functions must exist");
const createBody=html.slice(createStart,removeStart);
for(const call of ["await renderEmployeeRegister();","await renderPeopleOperationsHub();","await renderPeopleReportingSetup();"]){
  assert.ok(createBody.includes(call),`employee create must immediately reconcile: ${call}`);
}
assert.doesNotMatch(createBody,/peopleops[^\n]{0,120}classList\.contains\("active"\)/,"employee reconciliation must not depend on People view being active");

const employeeStart=html.indexOf('<section id="employees"');
const dailyStart=html.indexOf('<section id="dailyreports"',employeeStart);
assert.ok(employeeStart>0&&dailyStart>employeeStart,"Employees workspace section must exist");
const employeeSection=html.slice(employeeStart,dailyStart);
assert.match(employeeSection,/employee-directory-shell/,"Employees must use the V188 directory shell");
assert.match(employeeSection,/Team structure/,"Employees must retain the org-chart-inspired team structure cue");
assert.match(employeeSection,/id="employeeRegister" class="employee-register-list"/,"employee register hook must remain intact inside the redesigned directory");
assert.match(employeeSection,/data-bw-onclick="addEmployeeRecord\(\)"/,"Add employee must remain wired through the approved delegated action");
assert.match(employeeSection,/id="eName"/);
assert.match(employeeSection,/id="eRole"/);
assert.match(employeeSection,/id="eStart"/);
assert.match(employeeSection,/id="eContract"/);
assert.match(employeeSection,/id="eAsset"/);
const employeeStyles=fs.readFileSync(new URL("../public/assets/employee-directory-v188.css",import.meta.url),"utf8");
assert.match(html,/id="thebe-employee-directory-styles" rel="stylesheet" href="\/assets\/employee-directory-v188\.css"/,"canonical workspace must load the versioned employee directory stylesheet");
assert.match(employeeStyles,/V188 Employee Directory/,"versioned employee stylesheet must ship the redesigned employee page");
assert.match(employeeStyles,/#employees \.employee-directory-layout\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(300px,\.7fr\)/,"employee directory must use a bounded directory/form split");
assert.match(employeeStyles,/body\.thebe-ai-dock-open #employees \.employee-directory-layout\{grid-template-columns:1fr\}/,"employee directory must collapse safely while Thebe is open");
assert.match(employeeStyles,/#employees #employeeRegister>\.item/,"runtime employee rows must receive the org-style card treatment");

assert.match(html,/#appShell \*\{min-width:0\}/,"workspace descendants must be allowed to shrink instead of forcing column overflow");
assert.match(html,/#appShell \.view\{overflow-x:clip\}/,"workspace views must clip accidental horizontal overflow");
assert.match(html,/\.property-layout\{display:grid;grid-template-columns:minmax\(0,\.92fr\) minmax\(320px,1\.08fr\)/,"property layout must keep the compact calculator bounded beside results");
assert.match(html,/body\.thebe-ai-dock-open \.property-layout\{grid-template-columns:1fr\}/,'Property must collapse to one column while the desktop Thebe dock consumes workspace width');
assert.match(html,/\.property-valuation-service-card\{[^}]*background:#f7fbff/,'professional valuation service must have a distinct but restrained workspace treatment');
const propertyShard=JSON.parse(propertyFragments[1]);
const compactProperty=String(propertyShard.views?.propertyintelligence||"");
assert.match(compactProperty,/property-calculator-compact/,"Property scenario must use the compact calculator shell");
assert.match(compactProperty,/property-core-grid/,"Property scenario must keep the core deal inputs immediately visible");
assert.match(compactProperty,/<details class="property-advanced-details">/,"secondary underwriting assumptions must collapse behind More assumptions");
for(const id of ["propertyPurchasePrice","propertyMonthlyRent","propertyDeposit","propertyInterestRate"])assert.match(compactProperty,new RegExp('id="'+id+'"'),"compact calculator missing core input "+id);
for(const id of ["propertyVacancy","propertyOperatingCosts","propertyAcquisitionCosts","propertyLoanYears","propertyAppreciation"])assert.match(compactProperty,new RegExp('id="'+id+'"'),"compact calculator missing advanced input "+id);
assert.match(compactProperty,/Price \+ rent first\./,"empty result state must be concise and action-oriented");
assert.match(html,/property-risk-summary/,"calculated Property results must keep warning status visible in the compact view");
assert.match(html,/property-analysis-details/,"secondary Property metrics must collapse behind one Full analysis disclosure");
assert.match(html,/Full analysis/,"compact Property results must retain access to full underwriting detail");
const ownerCommand=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(ownerCommand,/Property Intelligence/,"Property portfolio must present as a major Property Intelligence capability");
assert.match(ownerCommand,/Your property portfolio/,"canonical portfolio must lead the governed Property workspace");
for(const stage of ["Portfolio","Performance","Deal check","Professional valuation"])assert.match(ownerCommand,new RegExp('propertyJourneyCard\\("[1-4]","'+stage),"Property journey missing stage "+stage);
assert.match(ownerCommand,/Thebe does not create, certify, sign or independently verify a valuation/,"professional valuation authority boundary must remain explicit");
for(const metric of ["propertyPortfolioAnnualRent","propertyPortfolioNoi","propertyPortfolioEquity","propertyPortfolioNoiYield"])assert.match(ownerCommand,new RegExp(metric),"Property owner performance metric missing: "+metric);
assert.match(ownerCommand,/annualRentMinor-annualOpexMinor|annualRentMinor\-annualOpexMinor/,"portfolio NOI must derive from recorded rent less recorded operating costs");
assert.match(ownerCommand,/recordedProfessionalValueMinor\|\|0\)\-Number\(portfolio\.debtBalanceMinor/,"recorded equity must derive from professional value less recorded debt");

assert.match(html,/@media\(max-width:900px\)\{\.people-outcome-grid,\.ops-primary-grid\{grid-template-columns:1fr\}\}/,"people workspace must collapse before narrow screens");
assert.match(html,/@media\(max-width:900px\)\{\.business-outcome-grid\{grid-template-columns:1fr\}\}/,"business workspace must collapse before narrow screens");
assert.match(html,/@media\(max-width:900px\)\{\.hub-grid,\.hub-grid-3\{grid-template-columns:1fr\}/,"workspace hubs must collapse before narrow screens");

console.log("V177_WORKSPACE_ADVERSARIAL_PASS");

const propertyRuntime=fs.readFileSync("public/js/workspace-runtime-20260929c.js","utf8");
assert.match(html,/Save scenario/,"compact Property calculator must allow assumption scenarios to be saved");
assert.match(html,/Saved deal scenarios/,"Property must expose compact scenario comparison");
assert.match(propertyRuntime,/PROPERTY_SCENARIO_KEY="thebe\.property\.scenarios\.v1"/,"scenario comparison must use an isolated scenario namespace");
assert.match(propertyRuntime,/rows\.slice\(0,3\)/,"scenario comparison must remain bounded to three scenarios");
assert.match(propertyRuntime,/Saved scenario only — not a valuation or portfolio record/,"saved scenarios must preserve the valuation and canonical-record boundary");
assert.doesNotMatch(propertyRuntime,/savePropertyScenario[\s\S]{0,2500}\/api\/property\/portfolio/,"saving a scenario must not silently write assumptions into the canonical property portfolio");

assert.match(propertyRuntime,/function propertyPortfolioImpact\(x\)/,"Property deal analysis must expose canonical portfolio impact");
assert.match(propertyRuntime,/incrementalDebt:x\.loan/,"portfolio impact must use modeled acquisition debt");
assert.match(propertyRuntime,/incrementalNoi:x\.noi/,"portfolio impact must use modeled incremental NOI");
assert.match(propertyRuntime,/Purchase price is <b>not<\/b> added to recorded professional portfolio value/,"scenario purchase price must never become professional portfolio value");
assert.doesNotMatch(propertyRuntime,/proFormaValue\s*[:=][^\n;]*x\.purchase/,"scenario purchase price must not be promoted into pro-forma professional value");
assert.match(ownerCommand,/__thebePropertyPortfolioImpact/,"canonical portfolio context must be explicitly bounded for scenario impact");

for(const visual of ["property-capital-bar","property-income-flow","property-coverage-ring"])assert.match(ownerCommand,new RegExp(visual),"Property Intelligence missing visual infographic: "+visual);
assert.match(ownerCommand,/Rent <b id="propertyFlowRent">—<\/b>/,"income-flow infographic must begin from recorded rent");
assert.match(ownerCommand,/NOI <b id="propertyFlowNoi">—<\/b>/,"income-flow infographic must expose recorded NOI");
assert.match(ownerCommand,/Valuation readiness/,"valuation coverage must be shown visually");
assert.match(ownerCommand,/property-more-actions/,"secondary register actions must be consolidated instead of adding another persistent button");

assert.match(ownerCommand,/property-asset-visual/,"individual properties must use visual performance cards");
assert.match(ownerCommand,/Record details/,"dense property provenance must be progressive disclosure");
assert.match(ownerCommand,/property-record-actions/,"property record actions must be consolidated");
assert.match(ownerCommand,/property-valuation-pipeline/,"professional valuation status must use a workflow infographic");
assert.doesNotMatch(ownerCommand,/summaryStrip\.className="outcome-status-strip"/,"valuation summary must not regress to a dense chip strip");

assert.match(html,/protected-workflow-launch/,"HR protected workflows must use a compact launcher instead of six persistent buttons");
assert.match(html,/ops-visual-brief/,"Daily Reports must expose an at-a-glance visual brief");
assert.match(runtime,/opsVisualExpected/,"Daily Reports visual brief must use live expected-report data");
assert.match(runtime,/opsCoverageTrack/,"Daily Reports coverage visualization must be driven by live coverage");

assert.match(html,/ai-scope-disclosure/,"Thebe AI explanatory scope must use progressive disclosure");
assert.match(html,/ai-scope-visual/,"Thebe AI scope must use a compact visual flow");
assert.match(html,/corporate-change-launch/,"Corporate change workflows must use one guided launcher instead of six persistent buttons");
assert.match(html,/cipa-reconciliation-disclosure/,"dense CIPA reconciliation must be progressive disclosure");
assert.match(html,/notification-radar/,"Notifications must use a compact attention visualization");
assert.match(html,/notification-policy-disclosure/,"notification policy detail must not consume default viewport height");
