import fs from 'node:fs';
import assert from 'node:assert/strict';
import {__v782150Test} from '../cloudflare/src/worker.js';

// Release regression for the production registration, owner access and navigation hotfix.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const worker=read('cloudflare/src/worker.js');
const html=read('public/index.html');
const api=read('public/js/api-client.js');
const direct=read('public/js/register-direct.js');
const sw=read('public/sw.js');
let checks=0;const ok=(name,value)=>{assert.ok(value,name);checks++};

ok('production PBKDF2 work factor is Worker-compatible',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));
ok('rehash policy upgrades only weaker hashes and never downgrades stronger ones',worker.includes('parsed.iterations<PASSWORD_PBKDF2_ITERATIONS'));
const current='pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';
const stronger='pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';
ok('current hash remains current',__v782150Test.parsePasswordHash(current)?.iterations===100000&&!__v782150Test.passwordNeedsRehash(current));
ok('stronger accepted hash is not downgraded',__v782150Test.parsePasswordHash(stronger)?.iterations===120000&&!__v782150Test.passwordNeedsRehash(stronger));
ok('registration still creates an owner membership',worker.includes("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')"));
ok('registration keeps IP global and account throttles',worker.includes('register-ip')&&worker.includes('register-platform')&&worker.includes('register-account'));
ok('first-party registration protection remains fail closed',direct.includes('/api/auth/registration-proof/challenge')&&direct.includes('turnstileToken:proof'));
ok('direct registration verifies usability by logging in after creation',direct.includes('btn.textContent="Signing in…"')&&direct.includes('await api("/api/auth/login"'));
ok('registration protection error is user-readable',api.includes('registration_protection_failed:"Registration protection expired'));
ok('platform specialist tools start hidden',html.includes('<details class="nav-specialist-tools" hidden>')&&html.includes('.nav-specialist-tools[hidden]{display:none!important}'));
ok('owner platform screens require positive platform-admin status',html.includes('let platformRegulatoryAccess=false')&&html.includes('platformRegulatoryAccess=status?.role==="admin"'));
ok('owner view matrix conditionally includes platform-only buttons',html.includes('const platformAdminViews=platformRegulatoryAccess?')&&html.includes('new Set([...allCustomer,...platformAdminViews])'));
ok('logout clears platform UI privilege',html.includes('async function logoutUser(){platformRegulatoryAccess=false;'));
ok('no company-name privilege shortcut was introduced',!html.includes('Lovely Group')&&!html.includes('Lovey Group')&&!worker.includes('Lovely Group')&&!worker.includes('Lovey Group'));
ok('service worker cache is rotated for fixed UI/runtime assets',sw.includes('registration-owner-ui-hotfix-20260914'));
console.log(`V82 registration/owner/navigation hardening: ${checks}/${checks} PASS`);
