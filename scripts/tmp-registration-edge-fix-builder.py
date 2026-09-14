from pathlib import Path

worker_path=Path('cloudflare/src/worker.js')
worker=worker_path.read_text()

def replace_once(source, old, new, label):
    count=source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return source.replace(old,new,1)

worker=replace_once(worker,
    'const PASSWORD_PBKDF2_ITERATIONS=120000;',
    'const PASSWORD_PBKDF2_ITERATIONS=100000;',
    'PBKDF2 runtime work factor')
worker=replace_once(worker,
    'const PASSWORD_PBKDF2_MAX_ITERATIONS=300000;',
    'const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;',
    'PBKDF2 production parser ceiling')

old_registration='''      const userId=id(),tenantId=id();
      try{await env.DB.batch([
        env.DB.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").bind(tenantId,companyName),
        env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)").bind(userId,email,email.split("@")[0],ph),
        env.DB.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").bind(tenantId,userId),
        env.DB.prepare("INSERT INTO subscriptions(tenant_id,plan,status,trial_ends_at) VALUES(?,?,'trialing',datetime('now','+14 days'))").bind(tenantId,SELF_SERVE_PLAN_IDS.has(String(body.plan||"").toLowerCase())?String(body.plan).toLowerCase():"business")
      ]);await registrationTimingFloor(registrationStartedAt);return json(generic,202)}catch(e){if(/unique|constraint/i.test(String(e?.message||e))){await registrationTimingFloor(registrationStartedAt);return json(generic,202)}throw e}'''
new_registration='''      const userId=id(),tenantId=id(),registrationStatements=[
        env.DB.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").bind(tenantId,companyName),
        env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)").bind(userId,email,email.split("@")[0],ph),
        env.DB.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").bind(tenantId,userId),
        env.DB.prepare("INSERT INTO subscriptions(tenant_id,plan,status,trial_ends_at) VALUES(?,?,'trialing',datetime('now','+14 days'))").bind(tenantId,SELF_SERVE_PLAN_IDS.has(String(body.plan||"").toLowerCase())?String(body.plan).toLowerCase():"business")
      ];
      if(csvEmailSet(env.PLATFORM_ADMIN_EMAILS).has(email))registrationStatements.push(
        env.DB.prepare("INSERT INTO platform_regulatory_principals(user_id,email,role,active) VALUES(?,?,'admin',1) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,role='admin',active=1").bind(userId,email)
      );
      try{await env.DB.batch(registrationStatements);await registrationTimingFloor(registrationStartedAt);return json(generic,202)}catch(e){if(/unique|constraint/i.test(String(e?.message||e))){await registrationTimingFloor(registrationStartedAt);return json(generic,202)}throw e}'''
worker=replace_once(worker,old_registration,new_registration,'registration transaction')

old_login='''      selected=selected||choices[0];
      const sess=await createPasswordSession(env,u.id,selected.tenant_id,selected.role,expectedPasswordHash,u.session_generation);'''
new_login='''      selected=selected||choices[0];
      if(csvEmailSet(env.PLATFORM_ADMIN_EMAILS).has(email))await env.DB.prepare(
        "INSERT INTO platform_regulatory_principals(user_id,email,role,active) VALUES(?,?,'admin',1) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,role='admin',active=1"
      ).bind(u.id,u.email).run();
      const sess=await createPasswordSession(env,u.id,selected.tenant_id,selected.role,expectedPasswordHash,u.session_generation);'''
worker=replace_once(worker,old_login,new_login,'platform admin login self-heal')
worker_path.write_text(worker)

Path('tests/v83-registration-edge-runtime.mjs').write_text(r'''import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const productionEntry=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const directClient=fs.readFileSync(new URL('../public/js/register-direct.js',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../.github/workflows/recovery-ci.yml',import.meta.url),'utf8');
const checks=[];
const ok=(name,condition)=>{assert.ok(condition,name);checks.push(name)};

ok('Workers PBKDF2 work factor is within the production runtime ceiling',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));
ok('unsupported 120k PBKDF2 work factor is absent',!worker.includes('const PASSWORD_PBKDF2_ITERATIONS=120000;'));
ok('stored-hash parser cannot send unsupported PBKDF2 work to production WebCrypto',worker.includes('const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;'));
ok('dummy password hash remains on the supported work factor',worker.includes('const DUMMY_PASSWORD_HASH="pbkdf2$100000$'));
ok('registration still hashes before inserting credentials',worker.includes('registrationStartedAt=Date.now(),ph=await hashPassword(password)'));
ok('password reset shares the same supported password hashing contract',worker.includes('const ph=await hashPassword(password);'));
ok('production entry verifies the first-party proof before registration reaches the base worker',productionEntry.includes('const proof=await verifyRegistrationProof(request,env,body?.turnstileToken)'));
ok('verified registration disables the legacy inner Turnstile verification path',productionEntry.includes('APP_ENV:"registration-proof-verified",TURNSTILE_SECRET_KEY:""'));
ok('direct registration client obtains the first-party proof challenge',directClient.includes('/api/auth/registration-proof/challenge'));
ok('platform-admin provisioning is gated by the explicit production email allowlist',worker.includes('csvEmailSet(env.PLATFORM_ADMIN_EMAILS).has(email)'));
ok('allowlisted admins receive an active platform principal on registration or login',worker.includes("platform_regulatory_principals(user_id,email,role,active) VALUES(?,?,'admin',1) ON CONFLICT(user_id) DO UPDATE"));
ok('recovery CI permanently exercises this edge-runtime regression',recovery.includes('node tests/v83-registration-edge-runtime.mjs'));

console.log(`v83 registration edge runtime: ${checks.length}/${checks.length} checks passed`);
''')

recovery_path=Path('.github/workflows/recovery-ci.yml')
recovery=recovery_path.read_text()
marker='          node tests/v82-release-provenance-governance.mjs\n'
if marker not in recovery:
    raise SystemExit('Recovery CI insertion marker missing')
if 'node tests/v83-registration-edge-runtime.mjs' not in recovery:
    recovery=recovery.replace(marker,marker+'          node tests/v83-registration-edge-runtime.mjs\n',1)
recovery_path.write_text(recovery)

Path('.github/workflows/tmp-registration-edge-fix-builder.yml').unlink(missing_ok=True)
Path('scripts/tmp-registration-edge-fix-builder.py').unlink(missing_ok=True)
