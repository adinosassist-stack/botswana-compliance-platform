import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusinessAnalytics} from '../cloudflare/src/business-analytics.js';
function context(reconciliation,trend={}){
 return {finance:{reconciliation,receivables:{},payables:{}},moneyIntelligence:{available:true,trend},operations:{latestSummaryDate:'2026-11-03'}};
}
test('missing reconciliation count never qualifies readiness as strong',()=>{
 const a=buildBusinessAnalytics(context({stale:false}));
 assert.equal(a.domains.money.reconciliationCurrent,false);
 assert.equal(a.domains.money.unresolvedReconciliationCount,null);
 assert.equal(a.dataQuality.readiness,'partial');
 const item=a.signals.find(x=>x.key==='finance_reconciliation_evidence_unavailable');
 assert.equal(item?.readOnly,true);assert.equal(item?.executionAllowed,false);
});
test('missing stale flag cannot qualify a zero-count reconciliation',()=>{
 const a=buildBusinessAnalytics(context({unresolvedCount:0}));
 assert.equal(a.domains.money.reconciliationCurrent,false);
 assert.equal(a.dataQuality.readiness,'partial');
 assert.ok(a.signals.some(x=>x.key==='finance_reconciliation_evidence_unavailable'));
});
test('verified zero and explicit non-stale flag remain current',()=>{
 const a=buildBusinessAnalytics(context({unresolvedCount:0,stale:false},{current30:{inflow:500,outflow:300,net:200}}));
 assert.equal(a.domains.money.reconciliationCurrent,true);
 assert.equal(a.dataQuality.readiness,'strong');
 assert.equal(a.domains.money.current30NetCashMovementMinor,200);
 assert.equal(a.signals.some(x=>x.key==='finance_reconciliation_evidence_unavailable'),false);
});
test('missing owner financial amounts remain null rather than fabricated zero',()=>{
 const a=buildBusinessAnalytics(context({unresolvedCount:0,stale:false}));
 assert.equal(a.domains.money.current30InflowMinor,null);
 assert.equal(a.domains.money.current30OutflowMinor,null);
 assert.equal(a.domains.money.current30NetCashMovementMinor,null);
 assert.equal(a.domains.money.overdueReceivablesMinor,null);
 assert.equal(a.domains.money.outstandingReceivablesMinor,null);
 assert.equal(a.domains.money.payablesDue14dMinor,null);
});
test('actual recorded zero amounts remain zero',()=>{
 const a=buildBusinessAnalytics({...context({unresolvedCount:0,stale:false},{current30:{inflow:0,outflow:0,net:0}}),finance:{reconciliation:{unresolvedCount:0,stale:false},receivables:{overdueMinor:0,outstandingMinor:0},payables:{due14dMinor:0,overdueMinor:0}}});
 assert.equal(a.domains.money.current30NetCashMovementMinor,0);
 assert.equal(a.domains.money.overdueReceivablesMinor,0);
 assert.equal(a.domains.money.payablesDue14dMinor,0);
});
