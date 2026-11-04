import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidateFreshness,readCandidateFreshness} from '../scripts/assess-r2-candidate-freshness.mjs';
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
