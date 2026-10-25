import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/src/agentic-entry.js';

test('minute schedule with dispatch off bypasses all platform jobs without DB access',async()=>{
 const waits=[];
 await worker.scheduled({cron:'* * * * *'},{DB:{prepare(){throw new Error('disabled_schedule_queried_database')}}},{waitUntil:promise=>waits.push(promise)});
 assert.equal(waits.length,1);assert.deepEqual(await Promise.all(waits),[{enabled:false,processed:0}]);
});

test('enabled minute schedule only touches dispatcher tables, never daily sweeps',async()=>{
 const statements=[],waits=[];
 const db={prepare(sql){statements.push(sql);return {bind(){return this},async run(){return {success:true,meta:{changes:0}}},async all(){return {success:true,results:[]}}}}};
 await worker.scheduled({cron:'* * * * *'},{DB:db,THEBE_EMPLOYEE_DISPATCH_ENABLED:'true'},{waitUntil:promise=>waits.push(promise)});
 assert.equal(waits.length,1);await Promise.all(waits);assert.equal(statements.length,2);
 assert.ok(statements.every(sql=>sql.startsWith('UPDATE employee_dispatch_queue')));
});

test('deployment configuration retains daily schedules and adds isolated minute recovery',()=>{
 const config=readFileSync('cloudflare/wrangler.toml','utf8');
 assert.match(config,/crons = \["15 6 \* \* \*", "15 16 \* \* \*", "\* \* \* \* \*"\]/);
 assert.doesNotMatch(config,/THEBE_EMPLOYEE_DISPATCH_ENABLED\s*=/);
});
