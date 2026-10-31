import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionDashboard} from '../cloudflare/src/platform-subscription-controls.js';
test('renewal queue explicitly requires active subscription and an unexpired seven-day period',async()=>{
 let listSql='',params=[];
 const db={prepare(sql){return {first:async()=>({active:2,paused:1}),bind(...args){params=args;listSql=sql;return this},all:async()=>({results:[]})}}};
 const r=await subscriptionDashboard(db,{status:'renewal'});
 assert.deepEqual(r.items,[]);
 assert.match(listSql,/\?='renewal' AND s\.status='active' AND datetime\(s\.current_period_ends_at\)>datetime\('now'\)/);
 assert.deepEqual(params.slice(-4),['renewal','renewal','renewal','renewal']);
});
test('invalid subscription dashboard filter is rejected before any database query',async()=>{
 await assert.rejects(subscriptionDashboard({prepare(){throw Error('DB accessed')}},{status:'unverified'}),/invalid_subscription_filter/);
});
