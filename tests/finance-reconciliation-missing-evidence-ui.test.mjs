import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/money-workspace-v307.js',import.meta.url),'utf8');
test('reconciliation count and exposure are treated as unavailable when missing',()=>{
 assert.match(source,/Number\.isSafeInteger\(recon\.unresolvedCount\)/);
 assert.match(source,/Number\.isSafeInteger\(recon\.unresolvedExposureMinor\)/);
 assert.match(source,/const reconCount=reconAvailable\?recon\.unresolvedCount:null/);
 assert.match(source,/const reconExposure=reconAvailable\?recon\.unresolvedExposureMinor:null/);
 assert.match(source,/reconAvailable\?count\(reconCount\):'Unavailable'/);
 assert.match(source,/reconAvailable\?moneyMinor\(reconExposure\):'Unavailable'/);
});
test('the UI never claims a current reconciliation without valid evidence',()=>{
 assert.match(source,/!reconAvailable\?'Evidence unavailable'/);
 assert.match(source,/!reconAvailable\?'warn'/);
 assert.match(source,/Reconciliation evidence not available/);
 assert.match(source,/finance_summary_not_canonical/);
 assert.match(source,/recon\.stale\?'Review freshness'/);
});
test('existing money source safety remains read-only and provider neutral',()=>{
 assert.match(source,/This summary is read-only and provider-neutral/);
 assert.match(source,/financeApiClient\(\)\.request\(API,\{method:'GET'\}\)/);
 assert.doesNotMatch(source,/innerHTML\s*=/);
});
