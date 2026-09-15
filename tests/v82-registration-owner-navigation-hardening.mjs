import fs from 'node:fs';
import assert from 'node:assert/strict';
import {__v782150Test} from '../cloudflare/src/worker.js';
import {__platformOwnerAccessTest} from '../cloudflare/src/platform-owner-access.js';

// Final release regression for the production registration, owner access and navigation hotfix.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const worker=read('cloudflare/src/worker.js');
const html=read('public/index.html');
const api=read('public/js/api-client.js');
const direct=read('public/js/register-direct.js');
const ownerAccess=read('cloudflare/src/platform-owner-access.js');
const agenticEntry=read('cloudflare/src/agentic-entry.js');
const sw=read('public/sw.js');
let checks=0;const ok=(name,value)=>{assert.ok(value,name);checks++};

ok('production PBKDF2 work factor is Worker-compatible',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));
ok('stored PBKDF2 parser is capped to the same Workers runtime maximum',worker.includes('const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;'));
ok('rehash policy upgrades only weaker hashes and never downgrades stronger ones',worker.includes('parsed.iterations<PASSWORD_PBKDF2_ITERATIONS'));
const current='pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';
const unsupported='pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';
ok('current hash remains current',__v782150Test.parsePasswordHash(current)?.iterations===100000&&!__v782150Test.passwordNeedsRehash(current));
ok('runtime-unsupported stronger hash fails closed before PBKDF2 derivation',__v782150Test.parsePasswordHash(unsupported)===null);

const password='Owner-regression-password-2026!';
const salt=Uint8Array.from({length:16},(_,index)=>index+1);
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const digest=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
const b64=bytes=>Buffer.from(bytes).toString('base64');
const stored=`pbkdf2$100000$${b64(salt)}$${b64(digest)}`;
ok('platform owner verifier accepts the existing correct password',await __platformOwnerAccessTest.verifyStoredPassword(password,stored));
ok('platform owner verifier rejects a wrong password',!(await __platformOwnerAccessTest.verifyStoredPassword('wrong-'+password,stored)));

ok('registration still creates an owner membership',worker.includes("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')"));
ok('registration keeps IP global and account throttles',worker.includes('register-ip')&&worker.includes('register-platform')&&worker.includes('register-account'));
ok('first-party registration protection remains fail closed',direct.includes('/api/auth/registration-proof/challenge')&&direct.includes('turnstileToken:proof'));
ok('direct registration verifies usability by logging in after creation',direct.includes('btn.textContent="Signing in…"')&&direct.includes('await api("/api/auth/login"'));
ok('existing registration uses password recovery instead of replacing credentials',direct.includes('/api/auth/password-reset/request')&&direct.includes('Registration never replaces an existing password'));
ok('owner workspace selection is completed with an explicit tenant login',direct.includes('finishWorkspaceSelection')&&direct.includes('tenantId')&&direct.includes('Opening owner workspace'));
ok('registration protection error is user-readable',api.includes('registration_protection_failed:"Registration protection expired'));

ok('platform owner repair is scoped to the explicit owner email',ownerAccess.includes('PLATFORM_OWNER_EMAIL="thebedesk@gmail.com"'));
ok('platform owner access cannot run until the stored password verifies',ownerAccess.indexOf('verifyStoredPassword(password,user.password_hash)')<ownerAccess.indexOf('ensurePlatformOwnerAccess(env,user.id)'));
ok('platform owner repair is same-origin constrained before any mutation',ownerAccess.includes('ownerLoginOriginAllowed(request,env)'));
ok('platform owner repair never rewrites user credentials',!ownerAccess.includes('UPDATE users'));
ok('platform owner membership is repaired to active owner when needed',ownerAccess.includes("UPDATE memberships SET role='owner',status='active'"));
ok('platform owner gets permanent server-side feature overrides',ownerAccess.includes('platform_owner_internal_full_access')&&ownerAccess.includes('INSERT OR REPLACE INTO entitlement_overrides'));
ok('platform owner receives bounded internal AI operating allowance without customer payment',ownerAccess.includes('PLATFORM_OWNER_AI_ALLOWANCE=10000')&&ownerAccess.includes('ai_credit_wallets')&&!ownerAccess.includes('payment_orders'));
ok('platform owner is provisioned as the explicit platform admin',ownerAccess.includes("platform_regulatory_principals")&&ownerAccess.includes("'admin',1,CURRENT_TIMESTAMP"));
ok('platform admin environment includes the explicit owner account',ownerAccess.includes('withPlatformOwnerAdminEnv')&&ownerAccess.includes('PLATFORM_ADMIN_EMAILS'));
ok('platform owner login is rewritten only after verified repair to select the canonical tenant',ownerAccess.includes('return withTenantId(request,body,tenantId)'));
ok('production agentic wrapper prepares owner login before canonical base authentication',agenticEntry.indexOf('preparePlatformOwnerLogin(request,runtimeEnv)')<agenticEntry.indexOf('base.fetch(preparedRequest,runtimeEnv,ctx)'));
ok('production wrapper applies the explicit platform-admin environment to canonical authorization',agenticEntry.includes('withPlatformOwnerAdminEnv(env)')&&agenticEntry.includes('base.fetch(preparedRequest,runtimeEnv,ctx)'));
ok('platform owner repair does not advance the D1 schema lineage',!fs.existsSync(new URL('../cloudflare/migrations/048_v82_platform_owner_access.sql',import.meta.url)));

ok('platform specialist tools start hidden',html.includes('<details class="nav-specialist-tools" hidden>')&&html.includes('.nav-specialist-tools[hidden]{display:none!important}'));
ok('owner platform screens require positive platform-admin status',html.includes('let platformRegulatoryAccess=false')&&html.includes('platformRegulatoryAccess=status?.role==="admin"'));
ok('owner view matrix conditionally includes platform-only buttons',html.includes('const platformAdminViews=platformRegulatoryAccess?')&&html.includes('new Set([...allCustomer,...platformAdminViews])'));
ok('logout clears platform UI privilege',html.includes('async function logoutUser(){platformRegulatoryAccess=false;'));
ok('no company-name privilege shortcut was introduced',!html.includes('Lovely Group')&&!html.includes('Lovey Group')&&!worker.includes('Lovely Group')&&!worker.includes('Lovey Group'));
const historicalRecoveryLineage=sw.includes('1.21.101-registration-owner-ui-hotfix-20260914')&&sw.includes('mobile-startup-recovery-20260915');
const retiredWorkerBoundary=sw.includes('LEGACY_CACHE_PREFIX="thebe-desk-"')&&sw.includes('self.registration.unregister()')&&!sw.includes('addEventListener("fetch"')&&!sw.includes('clients.openWindow');
ok('service worker remains on a safe registration/navigation lineage, either historical mobile recovery or the stricter self-retiring no-interception model',historicalRecoveryLineage||retiredWorkerBoundary);
console.log(`V82 registration/owner/navigation hardening: ${checks}/${checks} PASS`);
