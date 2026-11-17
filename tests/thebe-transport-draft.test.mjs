import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../docs/drafts/thebe-transport-2027-preview.html',import.meta.url),'utf8');
const spec=readFileSync(new URL('../docs/drafts/thebe-transport-2027-mvp.md',import.meta.url),'utf8');

test('Transport 2027 stays a synthetic, no-deployment and no-live-API draft',()=>{
 assert.match(spec,/2027/);
 assert.match(spec,/5 paying transport companies/);
 assert.match(spec,/P499\/company\/month/);
 assert.match(spec,/NOT merged, NOT deployed or enabled/);
 assert.match(spec,/No production code, feature flag, Worker, route, database, secrets, migrations, payment action or public preview/);
 assert.match(page,/<title>Thebe Transport/);
 assert.match(page,/No API, real payments, persistence, GPS or deployment/);
 assert.match(page,/Thebe Transport · draft for a possible 2027 release/);
 assert.doesNotMatch(page,/<script[^>]+src\s*=/i);
 assert.doesNotMatch(page,/<iframe\b/i);
 assert.doesNotMatch(page,/<form\b/i);
 assert.doesNotMatch(page,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\s*\(/);
 assert.doesNotMatch(page,/\b(?:https?:\/\/|\/\/[A-Za-z0-9]+\.)/);
 assert.doesNotMatch(page,/\b(?:linear|radial)-gradient\s*\(/i);
});
test('Transport preview offers dashboard, trip, reconciliation and fleet screens',()=>{
 for(const name of ['overview','trips','cash','fleet']){
  assert.match(page,new RegExp('data-tab="'+name+'"'));
  assert.match(page,new RegExp('id="'+name+'" class="tab'));
 }
 assert.match(page,/Conductor → manager handover/);
 assert.match(page,/not evidence of theft/i);
 assert.match(page,/No variance in this calculation; not bank-verified/);
 assert.match(page,/Approve handover \(disabled\)/);
 assert.match(page,/Register vehicle \(2027\)/);
 assert.match(page,/role="tablist"/);
 assert.match(page,/min-width:0/);
});
