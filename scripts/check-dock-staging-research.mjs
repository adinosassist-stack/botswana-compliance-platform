import {DOCK_HOST} from './dock-hosted-ingress-guard.mjs';

const origin = 'https://' + DOCK_HOST;
const endpoint = origin + '/api/ai/general';
const censusQuestion = 'Search the web for the population of Botswana in the 2022 Population and Housing Census. Cite the official Statistics Botswana source.';

export async function checkDockStagingResearch({accessToken, serviceAuth, fixture, fetchImpl = fetch, voice = false}) {
  const machineHeaders = serviceAuth ? {
    'CF-Access-Client-Id': serviceAuth.clientId,
    'CF-Access-Client-Secret': serviceAuth.clientSecret,
  } : {};
  const validAccess = serviceAuth
    ? Object.values(machineHeaders).every(value => /^[a-zA-Z0-9_.-]{16,256}$/.test(value ?? ''))
    : /^[\w-]+\.[\w-]+\.[\w-]+$/.test(accessToken ?? '');
  if (!validAccess ||
      !/^[a-f0-9]{64}$/.test(fixture?.sessionToken ?? '') ||
      !/^[a-f0-9]{64}$/.test(fixture?.csrfToken ?? '')) {
    throw new Error('Temporary Access and synthetic Dock session credentials required');
  }

  async function request(label, status, {session = true, csrf = fixture.csrfToken, requestOrigin = origin, question = censusQuestion} = {}) {
    const cookie = [!serviceAuth && 'CF_Authorization=' + accessToken,
      session && '__Host-bw_session=' + fixture.sessionToken].filter(Boolean).join('; ');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        origin: requestOrigin,
        ...machineHeaders,
        ...(cookie ? {cookie} : {}),
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({question}),
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
    if (response.status !== status) {
      throw new Error(label + ' expected HTTP ' + status + ', received ' + response.status);
    }
    return response;
  }

  await request('Missing session', 401, {session: false});
  await request('Invalid CSRF', 403, {csrf: '0'.repeat(64)});
  await request('Foreign origin', 403, {requestOrigin: 'https://untrusted.invalid'});
  const chat = await request('General chat', 200, {question: 'What is 2 plus 2? Reply with the numeral only.'});
  const reply = await chat.json();
  if (reply.ok !== true || reply.researchPerformed !== false || !/^4[.!]?$/.test(reply.answer?.trim() ?? '')) {
    throw new Error('General chat did not return the expected answer without web research');
  }
  const response = await request('Census research', 200);
  const data = await response.json();
  const officialCitation = (data.citations ?? []).find(citation => {
    const url = URL.parse(citation?.url);
    return url?.protocol === 'https:' &&
      ['statsbots.org.bw', 'www.statsbots.org.bw'].includes(url.hostname) &&
      !url.username && !url.password && !url.port;
  });
  if (data.ok !== true || data.researchPerformed !== true ||
      !/\b(?:2,359,609|2 359 609|2359609)\b/.test(data.answer ?? '') || !officialCitation) {
    throw new Error('Census response lacks the expected population or official citation');
  }
  if (voice) {
    const cookie = [!serviceAuth && 'CF_Authorization=' + accessToken,
      '__Host-bw_session=' + fixture.sessionToken].filter(Boolean).join('; ');
    const status = await fetchImpl(origin + '/api/agentic/live/status', {
      headers: {...machineHeaders, cookie}, redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    const readiness = status.ok ? await status.json() : null;
    if (readiness?.sessionCreationAllowed !== true || readiness.transport !== 'webrtc') {
      throw new Error('Private Dock voice is not ready to create a WebRTC session');
    }
  }
  return {...(voice ? {voiceReadinessVerified: true} : {}), chatVerified: true, population: 2359609, citation: officialCitation.url};
}
