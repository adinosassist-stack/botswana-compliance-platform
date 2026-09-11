import assert from 'node:assert/strict';
import {registrationTimingFloor as nodeFloor} from '../server/registration-timing.js';
import {__v782187Test} from '../cloudflare/src/worker.js';
let pass=0;const ok=(v,m)=>{assert.ok(v,m);console.log('PASS',m);pass++};
let started=Date.now();let r=await nodeFloor(started,{minMs:25,jitterMs:0});ok(r.elapsedMs>=20&&r.targetMs===25,'Node timing floor delays fast generic registration path to minimum');
started=Date.now()-50;r=await nodeFloor(started,{minMs:20,jitterMs:0});ok(r.elapsedMs>=50&&r.targetMs===20,'Node timing floor does not add delay after work already exceeded target');
started=Date.now();r=await __v782187Test.registrationTimingFloor(started,{minMs:25,jitterMs:0});ok(r.elapsedMs>=20&&r.targetMs===25,'Worker timing floor delays fast generic registration path to minimum');
started=Date.now()-50;r=await __v782187Test.registrationTimingFloor(started,{minMs:20,jitterMs:0});ok(r.elapsedMs>=50&&r.targetMs===20,'Worker timing floor does not add delay after work already exceeded target');
console.log(`V78 1.21.87 registration timing enumeration runtime: ${pass}/${pass} PASS`);
