import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {ACCOUNT, client, validateInputs, verifyActivationReadiness, verifyCurrentDeployment} from './dock-provision-inert-resources.mjs';
import {DOCK_WORKER, PRIVATE_DOCK_BACKEND} from './dock-hosted-ingress-guard.mjs';
import {runDockStagingResearch} from './run-dock-staging-research.mjs';

const env = process.env;
const repository = 'adinosassist-stack/botswana-compliance-platform';
const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

async function main() {
  const deployOnly = env.AUTHORIZATION === 'DEPLOY_DOCK_PRIVATE_STAGING';
  if (!deployOnly && env.AUTHORIZATION !== 'REHEARSE_DOCK_STAGING_RESEARCH') throw new Error('Protected rehearsal authorization required');
  const workspacePin = env.DOCK_ROLLBACK_WORKSPACE_VERSION;
  const backendPin = env.DOCK_ROLLBACK_BACKEND_VERSION;
  if ((workspacePin || backendPin) &&
      (deployOnly || !versionPattern.test(workspacePin ?? '') || !versionPattern.test(backendPin ?? ''))) {
    throw new Error('Both exact rollback versions are required for a post-deployment rehearsal');
  }
  const voice = !deployOnly && Boolean(env.DOCK_VOICE_OPENAI_KEY);
  if (voice && !workspacePin) throw new Error("Voice rehearsal requires exact deployed rollback versions");
  const emails = validateInputs({...env, AUTHORIZATION: 'PREFLIGHT_DOCK_STAGING_ACTIVATION'});
  const serviceAuth = env.DOCK_RESEARCH_SERVICE_TOKEN_ID ? {
    tokenId: env.DOCK_RESEARCH_SERVICE_TOKEN_ID,
    clientId: env.DOCK_RESEARCH_SERVICE_CLIENT_ID,
    clientSecret: env.DOCK_RESEARCH_SERVICE_CLIENT_SECRET,
  } : undefined;
  const validAccess = serviceAuth
    ? versionPattern.test(serviceAuth.tokenId) && [serviceAuth.clientId, serviceAuth.clientSecret]
      .every(value => /^[a-zA-Z0-9_.-]{16,256}$/.test(value ?? ''))
    : /^[\w-]+\.[\w-]+\.[\w-]+$/.test(env.DOCK_RESEARCH_ACCESS_TOKEN ?? '');
  if (!env.GH_TOKEN || !env.DOCK_WORKER_WRITE_TOKEN || !env.DOCK_RESEARCH_OPENAI_KEY ||
      (!deployOnly && !validAccess)) {
    throw new Error('Protected Dock rehearsal credentials are missing or malformed');
  }

  async function assertMain() {
    const response = await fetch('https://api.github.com/repos/' + repository + '/git/ref/heads/main', {
      headers: {Authorization: 'Bearer ' + env.GH_TOKEN},
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || (await response.json()).object?.sha !== env.EXPECTED_SHA) {
      throw new Error('Protected main moved before Dock rehearsal');
    }
  }

  const sessionSecret = randomBytes(32).toString('hex');
  const api = client(env.CLOUDFLARE_API_TOKEN);
  const directory = mkdtempSync(join(tmpdir(), 'dock-research-'));
  const files = {};
  const attempted = new Set();
  const childEnv = {
    PATH: env.PATH,
    CI: 'true',
    WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    CLOUDFLARE_API_TOKEN: env.DOCK_WORKER_WRITE_TOKEN,
  };

  function wrangler(...args) {
    return execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], {
      env: childEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90000,
    });
  }

  async function activate({suffix}) {
    const versions = {};
    for (const role of ['backend', 'workspace']) {
      const config = join(directory, role + '.json');
      const secretsPath = join(directory, role + '-secrets.json');
      const profile = execFileSync('python3', ['scripts/build-dock-staging-research-config.py', role, suffix, ...(voice ? ['--voice'] : [])], {
        env: {PATH: env.PATH}, encoding: 'utf8', timeout: 15000,
      });
      const secrets = {SESSION_SECRET: sessionSecret};
      if (role === 'backend') secrets.OPENAI_API_KEY = env.DOCK_RESEARCH_OPENAI_KEY;
      if (voice && role === 'workspace') secrets.OPENAI_API_KEY = env.DOCK_VOICE_OPENAI_KEY;
      writeFileSync(config, profile, {mode: 0o600});
      writeFileSync(secretsPath, JSON.stringify(secrets), {mode: 0o600});
      files[role] = config;
      await assertMain();
      const output = wrangler('versions', 'upload', '--config', config, '--secrets-file', secretsPath);
      rmSync(secretsPath);
      const id = output.match(/Worker Version ID:\s*([a-f0-9-]+)/)?.[1];
      if (!versionPattern.test(id ?? '')) throw new Error('Dock Worker upload did not report a version');
      versions[role] = id;
    }
    for (const role of ['backend', 'workspace']) {
      await assertMain();
      attempted.add(role);
      wrangler('versions', 'deploy', versions[role] + '@100%', '--config', files[role], '--yes');
    }
    return versions;
  }

  async function restore(versions) {
    const failed = [];
    for (const role of ['workspace', 'backend']) {
      if (!attempted.has(role)) continue;
      try {
        wrangler('rollback', versions[role], '--config', files[role], '--yes');
      } catch {
        failed.push(role);
      }
    }
    if (failed.length) throw new Error('Dock rollback failed for ' + failed.join(', '));
  }

  try {
    if (deployOnly) {
      await assertMain();
      const expectedVersion = env.DOCK_STAGING_BOOTSTRAP_VERSION_ID;
      const baseline = await verifyActivationReadiness({api, emails, expectedVersion, serviceTokenId: serviceAuth?.tokenId});
      console.log(JSON.stringify({rollbackVersions: baseline.rollbackVersions}));
      try {
        const versions = await activate({suffix: randomBytes(16).toString('hex')});
        for (const [role, worker] of Object.entries({backend: PRIVATE_DOCK_BACKEND, workspace: DOCK_WORKER})) {
          const path = '/accounts/' + ACCOUNT + '/workers/scripts/' + worker;
          const deployments = await api('GET', path + '/deployments');
          verifyCurrentDeployment(deployments.result, versions[role]);
          const subdomain = (await api('GET', path + '/subdomain')).result;
          if (subdomain?.enabled !== false || subdomain?.previews_enabled !== false) {
            throw new Error('Unexpected public ingress for Dock ' + role);
          }
        }
        console.log(JSON.stringify({versions, hostedAcceptance: 'deferred'}));
      } catch (error) {
        await restore(baseline.rollbackVersions);
        const restored = await verifyActivationReadiness({api, emails, expectedVersion, serviceTokenId: serviceAuth?.tokenId});
        if (restored.rollbackVersions.backend !== baseline.rollbackVersions.backend) {
          throw new Error('Dock backend rollback version could not be verified');
        }
        throw error;
      }
      return;
    }
    const evidence = await runDockStagingResearch({
      api, emails, expectedVersion: workspacePin || env.DOCK_STAGING_BOOTSTRAP_VERSION_ID,
      expectedBackendVersion: backendPin || undefined,
      sessionSecret, voice,
      accessToken: env.DOCK_RESEARCH_ACCESS_TOKEN, serviceAuth,
      assertMain, activate, restore,
    });
    console.log(JSON.stringify(evidence));
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

try {
  await main();
} catch (error) {
  // Wrangler's captured stdout and stderr can contain credential metadata.
  console.error(error.code || Object.hasOwn(error, 'stdout') ? 'Dock rehearsal command failed' : error.message);
  process.exitCode = 1;
}
