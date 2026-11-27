import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkDockStagingResearch} from '../scripts/check-dock-staging-research.mjs';

test('Dock hosted probe checks the staging boundary before spending a research request', async () => {
  const fixture = {sessionToken:'a'.repeat(64), csrfToken:'b'.repeat(64)};
  const accessToken = 'header.payload.signature';
  const statuses = [401, 403, 403, 200, 200];
  const requests = [];
  const citation = 'https://www.statsbots.org.bw/census';
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://dock-staging.thebedesk.com/api/ai/general');
    assert.equal(options.redirect, 'manual');
    requests.push(options.headers);
    const status = statuses.shift();
    if (status === 200 && statuses.length) {
      assert.match(JSON.parse(options.body).question, /2 plus 2/);
      return Response.json({ok:true,researchPerformed:false,answer:'4'});
    }
    return status === 200
      ? Response.json({ok:true,researchPerformed:true,answer:'Population: 2,359,609',citations:[{url:citation}]})
      : new Response(null, {status});
  };
  assert.deepEqual(await checkDockStagingResearch({fixture,accessToken,fetchImpl}), {chatVerified:true,population:2359609,citation});
  assert.equal(requests[0].cookie, 'CF_Authorization=' + accessToken);
  assert.notEqual(requests[1]['x-csrf-token'], fixture.csrfToken);
  assert.equal(requests[2].origin, 'https://untrusted.invalid');
  assert.equal(requests[3]['x-csrf-token'], fixture.csrfToken);
});

test('machine authentication sends Access headers without a personal cookie',async()=>{
 const serviceAuth={clientId:'synthetic-client-id',clientSecret:'synthetic-client-secret'};
 const fixture={sessionToken:'a'.repeat(64),csrfToken:'b'.repeat(64)};
 await assert.rejects(checkDockStagingResearch({serviceAuth,fixture,fetchImpl:async(url,{headers})=>{
  assert.equal(headers['CF-Access-Client-Id'],serviceAuth.clientId);
  assert.equal(headers['CF-Access-Client-Secret'],serviceAuth.clientSecret);
  assert.equal(headers.cookie,undefined);
  return new Response(null,{status:302});
 }}),/Missing session expected HTTP 401/);
});
