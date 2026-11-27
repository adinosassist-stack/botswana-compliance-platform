import {verifyActivationReadiness} from './dock-provision-inert-resources.mjs';
import {createDockStagingD1, withDockStagingFixture} from './run-dock-staging-fixture.mjs';
import {checkDockStagingResearch} from './check-dock-staging-research.mjs';

// The protected job supplies exact-main verification and the two Worker deployment operations.
export async function runDockStagingResearch({
  api, emails, expectedVersion, expectedBackendVersion, sessionSecret, accessToken, serviceAuth, assertMain,
  activate, restore, fetchImpl,
}) {
  await assertMain();
  const readiness = {api, emails, expectedVersion, expectedBackendVersion, serviceTokenId: serviceAuth?.tokenId};
  const baseline = await verifyActivationReadiness(readiness);
  return withDockStagingFixture({
    db: createDockStagingD1(api),
    verifiedDatabaseId: baseline.databaseId,
    sessionSecret,
  }, async fixture => {
    await assertMain();
    let evidence;
    try {
      await activate({suffix: fixture.suffix, rollbackVersions: baseline.rollbackVersions});
      evidence = await checkDockStagingResearch({accessToken, serviceAuth, fixture, fetchImpl});
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
