import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../public/js/owner-command-centre.js',import.meta.url),'utf8');
test('owner financial cards need real integer minor-unit evidence',()=>{
 assert.match(owner,/typeof value==="number"&&Number\.isSafeInteger\(value\)/);
 assert.match(owner,/validMinor\(m\.current30NetCashMovementMinor\)/);
 assert.match(owner,/validMinor\(m\.overdueReceivablesMinor\)/);
 assert.match(owner,/validMinor\(m\.payablesDue14dMinor\)/);
 assert.match(owner,/cashEvidence\?money\(net\/100\):"Unavailable"/);
 assert.match(owner,/collectionsEvidence\?money\(m\.overdueReceivablesMinor\/100\):"Unavailable"/);
 assert.match(owner,/supplierEvidence\?money\(m\.payablesDue14dMinor\/100\):"Unavailable"/);
});
test('unknown financial evidence never becomes a positive owner decision signal',()=>{
 assert.match(owner,/!cashEvidence\?"Recorded cash movement evidence is unavailable\."/);
 assert.match(owner,/!collectionsEvidence\?"Customer receivables evidence is unavailable\."/);
 assert.match(owner,/!supplierEvidence\?"Supplier commitment evidence is unavailable\."/);
 assert.match(owner,/setTextNode\("ownerPulseCash",cashEvidence\?money\(net\/100\):"—"\)/);
 assert.match(owner,/Cash movement only; not accounting profit/);
});
test('existing owner analytics and governed routes remain in place',()=>{
 assert.match(owner,/function renderBusinessAnalytics\(analytics\)/);
 assert.match(owner,/ownerAnalyticsPanel/);
 assert.match(owner,/setTextNode\("ownerPulseSales"/);
 assert.match(owner,/setTextNode\("ownerPulseCompliance"/);
});
