import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const owner=fs.readFileSync('public/js/owner-command-centre.js','utf8');
const section=id=>{const match=html.match(new RegExp('<section\\b[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</section>'));assert(match,'missing workspace '+id);return match[1]};
const cases=[
 {hub:'peopleops',target:'employees',field:'eName',save:'addEmployeeRecord',route:'/api/employees'},
 {hub:'peopleops',target:'dailyreports',field:'opsReportDate',save:'saveOps',route:'/api/daily-reporting/'},
 {hub:'businesshub',target:'profile',field:'pName',save:'saveProfile',route:'/api/state'},
 {hub:'businesshub',target:'taxprofile',field:'taxVatCategoryInput',save:'saveTaxFacts',route:'/api/state'},
 {hub:'businesshub',target:'licenceos',field:'newLicenceType',save:'createLicence',route:'/api/licences'},
 {hub:'businesshub',target:'companysecretary',field:'companyActionType',save:'createCompanyAction',route:'/api/company-actions'},
 {hub:'evidencehub',target:'vault',field:'evFile',save:'addEvidence',route:'/api/evidence/presign'},
 {hub:'tenderhub',target:'tenderready',field:'newTenderTitle',save:'createTender',route:'/api/tenders'},
 {hub:'automationhub',target:'workflowhub',field:'workflowTrigger',save:'createWorkflowRule',route:'/api/workflow-rules'},
];
for(const c of cases){assert(section(c.hub).includes('data-hub-target="'+c.target+'"'),c.hub+' must reach '+c.target);assert(section(c.target).includes('id="'+c.field+'"'),c.target+' input absent');assert(runtime.includes(c.save),c.target+' save handler absent');assert(runtime.includes(c.route),c.target+' persistence route absent')}
assert(section('sites').includes('sitesAddAuthoritative'));assert(html.includes('async function createSite()'));assert(html.includes('apiJson("/api/daily-reporting/locations",{method:"POST"'));
assert(owner.includes('portfolioAssetName'));assert(owner.includes('async function createPropertyAsset()'));assert(owner.includes('request("/api/property/assets",{method:"POST"'));
assert(runtime.includes('async function orderProfessionalService('));assert(runtime.includes('/api/services/orders'));
const money=fs.readFileSync('public/js/money-inputs-v310.js','utf8'),assets=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
for(const label of ['Add account','Record income','Record expense','Add customer','Add invoice','Add supplier','Add bill','Link payment','Import statement','Reconcile account','Review records'])assert(money.includes(label),'Money input missing: '+label);
assert(assets.includes('/js/money-inputs-v310.js'));assert(assets.includes('/assets/money-inputs-v310.css'));
console.log('PASS: main workspace entry paths, input fields and persistence handlers remain present; Money has explicit write/import/matching/review actions. This coverage gate complements runtime tests, not live tenant verification.');
