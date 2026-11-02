import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const panel=readFileSync(new URL('../public/js/thebe-assets-register.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/js/thebe-assets-register-client.js',import.meta.url),'utf8');
test('register is gated by authenticated tenant capability',()=>{assert.match(panel,/tenantAuthorized!==true/);assert.match(client,/tenantAuthorized!==true/)});
test('register renders text safely',()=>{assert.match(panel,/textContent=value/);assert.doesNotMatch(panel,/innerHTML\s*=/)});
test('client only calls same-origin fixed endpoint',()=>{assert.match(client,/fetcher\('\/api\/assets'/);assert.match(client,/credentials:'same-origin'/);assert.doesNotMatch(client,/companyId/)});
