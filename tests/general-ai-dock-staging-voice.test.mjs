import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/general-ai-dock-workspace-staging-worker.js';

const origin = 'https://dock-staging.thebedesk.com';
const env = {
  APP_ENV: 'staging',
  DOCK_STAGING_WORKSPACE_ORIGIN: origin,
  THEBE_LIVE_VOICE_ENABLED: 'true',
};

test('private Dock voice rejects requests outside the staging origin and fixture', async () => {
  const path = '/api/agentic/live/status';
  assert.equal((await worker.fetch(new Request('https://other.invalid' + path), env)).status, 404);
  assert.equal((await worker.fetch(new Request(origin + path), env)).status, 401);
  assert.equal((await worker.fetch(new Request(origin + path), {
    ...env,
    THEBE_LIVE_VOICE_ENABLED: 'false',
  })).status, 404);
});

test('private Dock voice does not expose marketing or delegation routes', async () => {
  const prefix = origin + '/api/agentic/live/';
  for (const path of ['marketing/status', 'marketing/session', 'delegation']) {
    const request = new Request(prefix + path, {
      method: path.endsWith('status') ? 'GET' : 'POST',
    });
    assert.equal((await worker.fetch(request, env)).status, 404);
  }
});
