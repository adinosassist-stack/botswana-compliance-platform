import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidateFreshness,readCandidateFreshness} from '../scripts/assess-r2-candidate-freshness.mjs';
import {decideCandidateCadence} from '../scripts/run-backup-cadence-observer.mjs';
const now='2026-11-04T17:30:00.000Z';
const valid=()=>({observedAt:now,lock:{success:true,result:{rules:[{id:'candidates-30-day-retention',enabled:true,prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]}},listing:{success:true,result:[
 {key:'candidates/41709222476/1/production-d1.sql',size:3224706,last_modified:'2026-11-03T20:11:10.090Z'},
 {key:'candidates/41710740133/1/production-d1.sql',size:3225845,last_modified:'2026-11-03T20:16:23.971Z'},
 {key:'candidates/41348652986/2/production-r2-sample.bin',size:7034,last_modified:'2026-11-01T21:05:21.640Z'}]}});
test('stale listed metadata is HOLD, never approved operational RPO',()=>{
 const r=assessCandidateFreshness(valid());
 assert.equal(r.listedSqlCandidates,2);
 assert.equal(r.exceedsTwoHourRecencyThreshold,true);
 assert.ok(r.latestAgeMinutes>120);
 for(const k of ['actualExportFinishedAtVerified','receiptAndBytesMatched','schedulerCadenceVerified','sustainedRpoQualified','restoreAuthorized','productionWriteAuthorized'])assert.equal(r[k],false);
});
test('even fresh listed metadata cannot prove sustained operational RPO',()=>{
 const v=valid();v.listing.result[1].last_modified='2026-11-04T17:10:00Z';
 const r=assessCandidateFreshness(v);
 assert.equal(r.exceedsTwoHourRecencyThreshold,false);
 assert.equal(r.sustainedRpoQualified,false);
 assert.match(r.disposition,/^HOLD_/);
});
test('24-hour window flags historical gaps despite a new successful backup candidate',()=>{
 const v=valid();
 v.listing.result.push({key:'candidates/41892086437/1/production-d1.sql',size:3277137,last_modified:'2026-11-04T17:20:00Z'});
 const r=assessCandidateFreshness(v);
 assert.equal(r.latestAgeMinutes,10);
 assert.equal(r.exceedsTwoHourRecencyThreshold,false);
 assert.equal(r.observationWindowHours,24);
 assert.equal(r.observedCandidateCountLast24h,3);
 assert.ok(r.maxObservedGapLast24hMinutes>120);
 assert.equal(r.sustainedRpoQualified,false);
});
test('a complete 24-hour metadata window with candidates every two hours has no observed gap breach',()=>{
 const v=valid(),start=Date.parse(now)-24*60*60*1000;
 v.listing.result=Array.from({length:13},(_,i)=>({
  key:`candidates/${80000000000+i}/1/production-d1.sql`,size:3100000,
  last_modified:new Date(start+i*2*60*60*1000).toISOString()
 }));
 const r=assessCandidateFreshness(v);
 assert.equal(r.latestAgeMinutes,0);
 assert.equal(r.maxObservedGapLast24hMinutes,120);
 assert.equal(r.observedCandidateCountLast24h,13);
 assert.equal(r.sustainedRpoQualified,false);
 assert.equal(r.restoreAuthorized,false);
});
test('no candidate in the 24-hour observation window remains stale and has a 1440-minute gap',()=>{
 const v=valid();
 v.listing.result=v.listing.result.filter(x=>x.key.endsWith('/production-d1.sql'));
 for(const item of v.listing.result)item.last_modified='2026-11-01T20:16:23.971Z';
 const r=assessCandidateFreshness(v);
 assert.equal(r.observedCandidateCountLast24h,0);
 assert.equal(r.maxObservedGapLast24hMinutes,1440);
 assert.equal(r.exceedsTwoHourRecencyThreshold,true);
});
test('millisecond-precise policy edges cannot be hidden by two-decimal display rounding',()=>{
 const start=Date.parse(now)-24*60*60*1000;
 const v=valid();
 v.listing.result=Array.from({length:11},(_,i)=>({
  key:`candidates/${90000000000+i}/1/production-d1.sql`,size:3100000,
  last_modified:new Date(start+(i+1)*120*60000+1).toISOString()
 }));
 const report=assessCandidateFreshness(v);
 assert.equal(report.maxObservedGapLast24hMinutes,120);
 assert.equal(report.exceedsTwoHourObservedGapLast24h,true);
 assert.equal(decideCandidateCadence(report).severity,'WINDOW_GAP');
 // Exactly one millisecond beyond 120 minutes is stale even if rendered 120.00.
 v.listing.result=[{key:'candidates/80000000000/1/production-d1.sql',size:3100000,
  last_modified:new Date(Date.parse(now)-120*60000-1).toISOString()}];
 const old=assessCandidateFreshness(v);
 assert.equal(old.latestAgeMinutes,120);
 assert.equal(old.exceedsTwoHourRecencyThreshold,true);
 assert.equal(decideCandidateCadence(old).severity,'STALE');
});
test('lock drift, partial/untrusted listing, future dates and incorrect keys fail closed',()=>{
 const v=valid();
 const cases=[
 {lock:{success:true,result:{rules:[]}}},
 {lock:{success:true,result:{rules:[{...v.lock.result.rules[0],prefix:'candidates'}]}}},
 {listing:{...v.listing,truncated:true}},
 {listing:{...v.listing,result_info:{cursor:'another-page'}}},
 {listing:{success:false,result:v.listing.result}},
 {listing:{success:true,result:[]}},
 {listing:{success:true,result:[{key:'candidates/41710740133/1/production-d1.sql',size:3225845,last_modified:'2026-11-05T17:00:00Z'}]}},
 {observedAt:'2026-13-04T17:30:00Z'}
 ];
 for(const change of cases)assert.throws(()=>assessCandidateFreshness({...v,...change}),/backup_cadence_hold_/);
});
test('ambiguous metadata keys cannot qualify backup recency',()=>{
 const v=valid();
 const candidate=v.listing.result[0];
 for(const injected of [
   {...candidate},
   {...candidate,key:'other/production-d1.sql'},
   {...candidate,key:null},
   {...candidate,key:1234},
   {...candidate,key:''}
 ]){
   const payload={...v,listing:{...v.listing,result:[...v.listing.result,injected]}};
   assert.throws(()=>assessCandidateFreshness(payload),/backup_cadence_hold_listing_keys_unverified/);
 }
});

test('provider read path uses GET only and never reads private object bytes',async()=>{
 const v=valid(),bodies=[v.lock,v.listing];let n=0;
 const o=await readCandidateFreshness({accountId:'ddd23cab31928a4bb3d4998df9b26d1d',token:'fake',observedAt:now,fetchImpl:async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  assert.ok(url.endsWith('/lock')||url.includes('/objects?prefix=candidates%2F&per_page=1000'));
  return {ok:true,text:async()=>JSON.stringify(bodies[n++])};
 }});
 assert.equal(n,2);assert.equal(o.restoreAuthorized,false);
 await assert.rejects(()=>readCandidateFreshness({accountId:'other',token:'fake'}),/backup_cadence_hold_authority/);
});
