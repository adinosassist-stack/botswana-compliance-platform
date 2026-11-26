import {createHmac, randomBytes} from 'node:crypto';
import {createDockFixtureAdapter} from '../cloudflare/src/general-ai-dock-fixture-adapter.js';

const databaseId = 'c63255cf-c589-4f6b-99c7-2d2e437566b5';

export async function withDockStagingFixture({db, verifiedDatabaseId, sessionSecret}, testFixture) {
  if (verifiedDatabaseId !== databaseId) throw new Error('Isolated Dock database required');
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
    throw new Error('Staging session secret required');
  }
  if (typeof testFixture !== 'function') throw new TypeError('Fixture callback required');

  const suffix = randomBytes(16).toString('hex');
  const sessionToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const fixture = createDockFixtureAdapter({
    db,
    databaseId,
    qualifiedDatabaseId: verifiedDatabaseId,
    fixtureId: 'dock-fixture-' + suffix,
    tokenHash: createHmac('sha256', sessionSecret).update(sessionToken).digest('hex'),
    csrfToken,
  });
  await fixture.assertAbsent();
  await fixture.create();
  let result;
  try {
    result = await testFixture({
      suffix,
      userId: fixture.userId,
      tenantId: fixture.tenantId,
      sessionToken,
      csrfToken,
    });
  } finally {
    await fixture.remove();
    await fixture.assertAbsent();
  }
  return result;
}
