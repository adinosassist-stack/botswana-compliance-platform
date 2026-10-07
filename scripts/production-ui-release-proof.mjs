import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const origin=String(process.env.UI_ORIGIN||'https://thebedesk.com').replace(/\/+$/,'');
const release=JSON.parse(fs.readFileSync('release/production.json','utf8'));
async function get(path){
  const response=await fetch(origin+path,{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,`${path}: HTTP ${response.status}`);
  return {response,body:await response.text()};
}
const version=JSON.parse((await get('/api/version')).body);
assert.equal(version.releaseSequence,release.sequence,'live release sequence');
assert.equal(version.sourceSha,release.sourceSha,'live qualified source');
const root=await get('/');
assert.equal(root.response.headers.get('x-thebe-source-sha'),release.sourceSha);
assert(root.body.includes(`name="thebe-assets-release" content="${release.sourceSha}"`));
assert(root.body.includes('thebe-dock-recovery-geometry-v269.js?release='+release.sourceSha),'current dock recovery is delivered');
assert(!root.body.includes('money-workspace-v307.js'),'private Money enhancement must not leak onto public root');
const pricing=await get('/pricing/');
assert(pricing.body.includes('.pricegrid .pricecard{display:none;flex-direction:column;align-items:stretch;'),'live pricing card layout');
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const asset of ['/js/property-visibility-v230.js','/assets/property-visibility-v230.css','/assets/property-operations-v262.css','/assets/property-optimise-v263.css','/assets/property-compare-v264.css','/js/thebe-dock-recovery-geometry-v269.js','/js/money-workspace-v307.js']){
  const live=await get(asset+'?release='+release.sourceSha);
  assert.equal(hash(live.body),hash(fs.readFileSync('public'+asset,'utf8')),`${asset}: live bytes match qualified source`);
}
if(fs.existsSync('public/assets/people-workspace-20261003.css')){
  const people=await get('/assets/people-workspace-20261003.css?release='+release.sourceSha);
  assert.equal(hash(people.body),hash(fs.readFileSync('public/assets/people-workspace-20261003.css','utf8')),'People stylesheet: exact live bytes');
  const runtime=await get('/js/workspace-runtime-20261001b.js?release='+release.sourceSha);
  const infographic=await get('/assets/people-infographics-20261003.css?release='+release.sourceSha);
  assert.equal(hash(infographic.body),hash(fs.readFileSync('public/assets/people-infographics-20261003.css','utf8')),'People infographics: exact live bytes');
  const workspace=await get('/?desktop-owner-proof=ui-release');
  assert(workspace.body.includes('peopleInfographicsMount'),'People infographic mount delivered on workspace surface');
  assert(workspace.body.includes('id="thebe-workspace-runtime"'),'workspace runtime externalized after nonce application');
  assert(!workspace.body.includes('id="thebe-workspace-runtime-inline"'),'inline workspace runtime removed');
  assert(!root.body.includes('peopleInfographicsMount'),'public homepage stays independent of private workspace');
  for(const marker of ['function renderPeopleInfographics(', 'async function refreshPeopleWorkspace()','peopleRefreshStatus','peopleReportingProgress'])assert(runtime.body.includes(marker),`People runtime missing ${marker}`);
}
if(fs.existsSync('public/js/thebe-live-preview-fallback-v272.js')){
  const bridge=await get('/js/thebe-live-preview-fallback-v272.js?release='+release.sourceSha);
  assert.equal(hash(bridge.body),hash(fs.readFileSync('public/js/thebe-live-preview-fallback-v272.js','utf8')),'voice fallback bridge: exact live bytes');
}
const production=fs.readFileSync('cloudflare/src/production-entry.js','utf8');
const prefix=production.match(/const WORKSPACE_VIEW_FRAGMENT_PREFIX="([^"]+)"/)?.[1];
assert(prefix,'workspace fragment prefix');
for(const [id,markers] of [
  ['propertyintelligence',['Compact Property Calculator','propertyPurchasePrice','propertyMonthlyRent','propertyDealResults']],
  ['servicesmarketplace',['market-v257-hero','market-v257-stats','focusMarketServices()','focusMarketOrders()','Tax-service delivery boundary verified']],
]){
  let code=0;for(const ch of id)code=(Math.imul(code,31)+ch.charCodeAt(0))>>>0;
  const shard=JSON.parse((await get(prefix+(code%12)+'.json?release='+release.sourceSha)).body);
  assert.equal(shard.schema,2);
  for(const marker of markers)assert(String(shard.views?.[id]||'').includes(marker),`${id}: missing live UI marker ${marker}`);
}
console.log(`UI_RELEASE_PROOF_PASS sequence=${release.sequence} source=${release.sourceSha} property=exact-assets market=current-lazy-fragment money=v307-exact-asset dock=exact-recovery`);
