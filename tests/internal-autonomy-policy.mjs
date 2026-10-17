import assert from 'node:assert/strict';
import {normalizeAutonomyPolicy} from '../cloudflare/src/agent-internal-autonomy.js';
const now=new Date('2026-10-16T10:00:00.000Z');
const base={scopes:['tasks','drafts','records'],delegationId:'delegation-a',taskTemplate:{title:'Review the operations summary',priority:2},expiresAt:'2026-10-30T10:00:00.000Z',intervalHours:24,maxDailyRuns:5};
assert.equal(normalizeAutonomyPolicy(base,now).ok,true);
for(const scopes of [['payments'],['tasks','payments'],[],['records','records']])assert.equal(normalizeAutonomyPolicy({...base,scopes},now).ok,false);
for(const extra of [{tenantId:'tenant-b'},{ownerUserId:'other'},{actionKey:'payment.execute'},{taskTemplate:{...base.taskTemplate,amount:100}},{maxDailyRuns:0},{maxDailyRuns:6},{intervalHours:0},{expiresAt:'invalid'},{expiresAt:'2027-10-30T10:00:00Z'},{expiresAt:now.toISOString()}])assert.equal(normalizeAutonomyPolicy({...base,...extra},now).ok,false,JSON.stringify(extra));
assert.equal(normalizeAutonomyPolicy({...base,scopes:['drafts','records'],delegationId:undefined,taskTemplate:undefined},now).ok,true);
console.log('internal autonomy policy bounds: PASS');
