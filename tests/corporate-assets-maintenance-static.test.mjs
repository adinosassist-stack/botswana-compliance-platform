import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const panel=readFileSync(new URL('../public/js/thebe-assets-maintenance.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/js/thebe-assets-maintenance-client.js',import.meta.url),'utf8');
test('maintenance UI is gated',()=>{assert.match(panel,/tenantAuthorized!==true/);assert.match(client,/tenantAuthorized!==true/)});
test('maintenance UI avoids HTML injection',()=>{assert.match(panel,/textContent=/);assert.doesNotMatch(panel,/innerHTML\s*=/)});
test('maintenance client uses fixed authenticated route',()=>{assert.match(client,/\/api\/assets\/maintenance/);assert.match(client,/credentials:'same-origin'/);assert.doesNotMatch(client,/companyId/)});
