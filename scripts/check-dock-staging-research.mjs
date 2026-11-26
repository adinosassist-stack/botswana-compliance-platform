import {DOCK_HOST} from './dock-hosted-ingress-guard.mjs';

const origin = 'https://' + DOCK_HOST;
const endpoint = origin + '/api/ai/general';
const censusQuestion = 'Search the web for the population of Botswana in the 2022 Population and Housing Census. Cite the official Statistics Botswana source.';

export async function checkDockStagingResearch({accessToken, fixture, fetchImpl = fetch}) {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(accessToken ?? '') ||
      !/^[a-f0-9]{64}$/.test(fixture?.sessionToken ?? '') ||
      !/^[a-f0-9]{64}$/.test(fixture?.csrfToken ?? '')) {
    throw new Error('Temporary Access and synthetic Dock session credentials required');
  }

  async function request(label, status, {session = true, csrf = fixture.csrfToken, requestOrigin = origin} = {}) {
    const cookie = 'CF_Authorization=' + accessToken +
      (session ? '; __Host-bw_session=' + fixture.sessionToken : '');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        origin: requestOrigin,
        cookie,
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({question: censusQuestion}),
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
  return {population: 2359609, citation: officialCitation.url};
}
