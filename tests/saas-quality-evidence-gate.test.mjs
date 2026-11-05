import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSaasQualityEvidence} from '../scripts/saas-quality-evidence-gate.mjs';
const valid=()=>({exactSha:'a'.repeat(40),ciPassed:true,independentReview:true,stagingSmokePassed:true,tenantIsolationPassed:true,recoveryQualified:true,navigationSamples:[{view:'finance',activateMs:30,settledFrameMs:80,worstLongTaskMs:0,longTaskCount:0,longTaskTotalMs:0,longTaskSupported:true}]});
test('complete synthetic evidence can qualify without contacting services',()=>{assert.equal(evaluateSaasQualityEvidence(valid()).qualified,true);});
test('missing CI, reviewer and recovery never qualify',()=>{const x=valid();delete x.ciPassed;x.independentReview=false;x.recoveryQualified=false;const r=evaluateSaasQualityEvidence(x);assert.equal(r.qualified,false);assert.ok(r.failures.includes('recoveryQualified_unverified'));});
test('NaN, missing metrics and observer gaps fail closed',()=>{for(const change of [s=>s.activateMs=NaN,s=>delete s.settledFrameMs,s=>s.longTaskSupported=false,s=>s.longTaskCount=-1]){const x=valid();change(x.navigationSamples[0]);assert.equal(evaluateSaasQualityEvidence(x).qualified,false);}});
test('duplicates, invalid route names, impossible totals and blocking tasks are rejected',()=>{for(const change of [x=>x.navigationSamples.push({...x.navigationSamples[0]}),x=>x.navigationSamples[0].view='customer@example.com',x=>{x.navigationSamples[0].worstLongTaskMs=50;},x=>{x.navigationSamples[0].activateMs=201;}]){const x=valid();change(x);assert.equal(evaluateSaasQualityEvidence(x).qualified,false);}});
test('no sample or fake sha cannot qualify',()=>{const x=valid();x.navigationSamples=[];x.exactSha='main';assert.equal(evaluateSaasQualityEvidence(x).qualified,false);});
