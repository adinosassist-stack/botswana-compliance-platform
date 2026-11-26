import {createHmac, randomBytes} from 'node:crypto';
import {ACCOUNT} from './dock-provision-inert-resources.mjs';
import {createDockFixtureAdapter} from '../cloudflare/src/general-ai-dock-fixture-adapter.js';

const databaseId = 'c63255cf-c589-4f6b-99c7-2d2e437566b5';

// The protected runner supplies its authenticated Cloudflare API client.
export function createDockStagingD1(api) {
  const endpoint = '/accounts/' + ACCOUNT + '/d1/database/' + databaseId + '/query';
  async function query(body, count) {
    const {result} = await api('POST', endpoint, body);
    if (!Array.isArray(result) || result.length !== count || result.some(row => row?.success !== true)) {
      throw new Error('Dock staging D1 query failed');
    }
    return result;
  }

  return {
    prepare(sql) {
      return {
        bind(...params) {
          const statement = {sql, params};
          return {
            statement,
            async first() {
              const [response] = await query(statement, 1);
              if (!Array.isArray(response.results)) throw new Error('Dock staging D1 rows missing');
              return response.results[0] ?? null;
            },
          };
        },
      };
    },
    batch(statements) {
      return query({batch: statements.map(item => item.statement)}, statements.length);
    },
  };
}

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
