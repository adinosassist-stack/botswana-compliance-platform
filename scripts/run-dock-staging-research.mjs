import {readFileSync} from 'node:fs';
import {verifyActivationReadiness} from './dock-provision-inert-resources.mjs';
import {createDockStagingD1, withDockStagingFixture} from './run-dock-staging-fixture.mjs';
import {checkDockStagingResearch} from './check-dock-staging-research.mjs';

// The protected job supplies exact-main verification and the two Worker deployment operations.
export async function runDockStagingResearch({
  api, emails, expectedVersion, expectedBackendVersion, sessionSecret, accessToken, serviceAuth, assertMain,
  activate, restore, fetchImpl, voice = false,
}) {
  await assertMain();
  const readiness = {api, emails, expectedVersion, expectedBackendVersion, serviceTokenId: serviceAuth?.tokenId};
  const baseline = await verifyActivationReadiness(readiness);
  const db = createDockStagingD1(api);
  if (voice) {
    const identity = await db.prepare('SELECT database_id,environment FROM dock_staging_identity WHERE id=1').bind().first();
    if (identity?.database_id !== baseline.databaseId || identity.environment !== 'dock-hosted-staging') {
      throw new Error('Dock staging voice database marker did not match');
    }
    await assertMain();
    const schema = readFileSync(new URL('../cloudflare/schema/dock-staging-voice-audit.sql', import.meta.url), 'utf8');
    await db.batch([db.prepare(schema).bind()]);
  }
  return withDockStagingFixture({
    db,
    verifiedDatabaseId: baseline.databaseId,
    sessionSecret,
  }, async fixture => {
    await assertMain();
    let evidence;
    try {
      await activate({suffix: fixture.suffix, rollbackVersions: baseline.rollbackVersions});
      evidence = await checkDockStagingResearch({accessToken, serviceAuth, fixture, fetchImpl, voice});
    } finally {
      await restore(baseline.rollbackVersions);
      const restored = await verifyActivationReadiness(readiness);
      if (restored.rollbackVersions.backend !== baseline.rollbackVersions.backend) {
        throw new Error('Dock backend rollback version could not be verified');
      }
    }
    return evidence;
  });
}
