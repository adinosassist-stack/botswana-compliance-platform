import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkDockStagingResearch} from '../scripts/check-dock-staging-research.mjs';

test('Dock hosted probe checks the staging boundary before spending a research request', async () => {
  const fixture = {sessionToken:'a'.repeat(64), csrfToken:'b'.repeat(64)};
  const accessToken = 'header.payload.signature';
  const statuses = [401, 403, 403, 200];
  const requests = [];
  const citation = 'https://www.statsbots.org.bw/census';
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://dock-staging.thebedesk.com/api/ai/general');
    assert.equal(options.redirect, 'manual');
    requests.push(options.headers);
    const status = statuses.shift();
    return status === 200
      ? Response.json({ok:true,researchPerformed:true,answer:'Population: 2,359,609',citations:[{url:citation}]})
      : new Response(null, {status});
  };
  assert.deepEqual(await checkDockStagingResearch({fixture,accessToken,fetchImpl}), {population:2359609,citation});
  assert.equal(requests[0].cookie, 'CF_Authorization=' + accessToken);
  assert.notEqual(requests[1]['x-csrf-token'], fixture.csrfToken);
  assert.equal(requests[2].origin, 'https://untrusted.invalid');
  assert.equal(requests[3]['x-csrf-token'], fixture.csrfToken);
});
