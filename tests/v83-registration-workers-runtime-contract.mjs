import fs from 'node:fs';
import assert from 'node:assert/strict';
import {__v782150Test} from '../cloudflare/src/worker.js';

const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
let checks=0;
const ok=(name,value)=>{assert.ok(value,name);checks++};

ok('new password hashes use the Cloudflare Workers supported PBKDF2 maximum',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));
ok('stored password hashes are capped to the same runtime maximum',worker.includes('const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;'));
ok('current 100k hash parses',__v782150Test.parsePasswordHash('pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=')?.iterations===100000);
ok('100001 hash fails closed before derivation',__v782150Test.parsePasswordHash('pbkdf2$100001$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=')===null);
ok('120k hash fails closed before derivation',__v782150Test.parsePasswordHash('pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=')===null);
ok('registration keeps owner membership creation',worker.includes("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')"));
ok('registration keeps trial subscription creation',worker.includes("INSERT INTO subscriptions(tenant_id,plan,status,trial_ends_at) VALUES(?,?,'trialing',datetime('now','+14 days'))"));

console.log(`V83 Workers registration runtime contract: ${checks}/${checks} PASS`);
