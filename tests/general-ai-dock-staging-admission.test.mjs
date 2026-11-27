import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {exchangeDockStagingInvitation, handleDockStagingAdmission} from '../cloudflare/src/general-ai-dock-staging-admission.js';

test('Dock invitation keeps its original expiry and redeems at most once', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../cloudflare/schema/dock-hosted-staging-auth-candidate.sql', import.meta.url), 'utf8'));
    const fixture = 'dock-fixture-' + 'a'.repeat(32);
    const user = fixture + '-user';
    const tenant = fixture + '-tenant';
    const secret = 's'.repeat(64);
    const ticket = 'dock-test-' + 'b'.repeat(64);
    const hash = value => createHmac('sha256', secret).update(value).digest('hex');
    const env = {
      APP_ENV: 'staging',
      DOCK_STAGING_ADMISSION_ENABLED: 'true',
      DOCK_RESEARCH_FIXTURE_USER_ID: user,
      DOCK_RESEARCH_FIXTURE_TENANT_ID: tenant,
      SESSION_SECRET: secret,
      DB: {prepare: sql => ({bind: (...args) => ({first: async () => db.prepare(sql).get(...args)})})},
    };
    db.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(tenant, 'Test');
    db.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run(user, 'fixture@example.invalid', 'Test');
    db.prepare("INSERT INTO memberships VALUES(?,?,'owner','active')").run(tenant, user);
    db.prepare(`INSERT INTO sessions(token_hash,public_id,user_id,tenant_id,role,csrf_token,session_generation,expires_at)
      VALUES(?,?,?,?,'owner',?,0,datetime('now','+10 minutes'))`).run(hash(ticket), 'test', user, tenant, 'c'.repeat(64));

    const expiry = db.prepare('SELECT expires_at FROM sessions').get().expires_at;
    assert.equal(await exchangeDockStagingInvitation({...env, APP_ENV: 'production'}, ticket), null);
    const attempts = await Promise.all([exchangeDockStagingInvitation(env, ticket), exchangeDockStagingInvitation(env, ticket)]);
    const sessions = attempts.filter(Boolean);
    assert.equal(sessions.length, 1);
    const row = db.prepare('SELECT token_hash,expires_at FROM sessions').get();
    assert.equal(row.token_hash, hash(sessions[0].cookie));
    assert.equal(row.expires_at, expiry);
    db.prepare("UPDATE sessions SET token_hash=?,created_at=datetime('now','-10 minutes'),expires_at=datetime('now','-1 minute')").run(hash(ticket));
    assert.equal(await exchangeDockStagingInvitation(env, ticket), null);
  } finally {
    db.close();
  }
});

test('Dock sign-in requires Cloudflare Access even when admission is enabled', async () => {
  const origin = 'https://dock-staging.thebedesk.com';
  const response = await handleDockStagingAdmission(new Request(origin + '/dock-staging/sign-in'), {
    APP_ENV: 'staging',
    DOCK_STAGING_ADMISSION_ENABLED: 'true',
    DOCK_STAGING_WORKSPACE_ORIGIN: origin,
    DOCK_STAGING_ACCESS_TEAM_ORIGIN: 'https://test.cloudflareaccess.com',
    DOCK_STAGING_ACCESS_AUD: 'test-dock-audience',
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('set-cookie'), null);
});
