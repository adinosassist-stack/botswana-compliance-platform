import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare/src/release-governance-entry.js',import.meta.url),'utf8');
test('readiness timing is gated to GET staging explicit opt-in',()=>{
 assert.match(source,/method==="GET"&&path==="\/api\/ready"&&String\(env\?\.APP_ENV\|\|""\)==="staging"&&String\(env\?\.THEBE_READINESS_TIMING_DIAGNOSTIC\|\|""\)==="1"/);
});
test('timing reports sanitized bounded duration only',()=>{
 assert.match(source,/headers\.set\("server-timing",/);
 assert.match(source,/Math\.min\(duration,60000\)/);
});
test('ordinary production request keeps existing return path',()=>{
 assert.match(source,/const response=await base\.fetch\(request,downstreamEnv,ctx\);\s*await recordRegistrationSuccess/);
});
