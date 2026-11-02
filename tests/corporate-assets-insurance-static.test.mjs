import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../public/js/thebe-assets-insurance.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/js/thebe-assets-insurance-client.js',import.meta.url),'utf8');
test('insurance UI and client require capability',()=>{assert.match(ui,/tenantAuthorized!==true/);assert.match(client,/tenantAuthorized!==true/)});
test('insurance uses safe text and fixed endpoint',()=>{assert.doesNotMatch(ui,/innerHTML\s*=/);assert.match(client,/\/api\/assets\/insurance/);assert.match(client,/credentials:'same-origin'/)});
