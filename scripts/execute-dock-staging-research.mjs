import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {ACCOUNT, client, validateInputs} from './dock-provision-inert-resources.mjs';
import {runDockStagingResearch} from './run-dock-staging-research.mjs';

const env = process.env;
const repository = 'adinosassist-stack/botswana-compliance-platform';
const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

async function main() {
  if (env.AUTHORIZATION !== 'REHEARSE_DOCK_STAGING_RESEARCH') throw new Error('Protected rehearsal authorization required');
  const emails = validateInputs({...env, AUTHORIZATION: 'PREFLIGHT_DOCK_STAGING_ACTIVATION'});
  if (!env.GH_TOKEN || !env.DOCK_WORKER_WRITE_TOKEN || !env.DOCK_RESEARCH_OPENAI_KEY ||
      (env.DOCK_RESEARCH_SESSION_SECRET ?? '').length < 32 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(env.DOCK_RESEARCH_ACCESS_TOKEN ?? '')) {
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
      const profile = execFileSync('python3', ['scripts/build-dock-staging-research-config.py', role, suffix], {
        env: {PATH: env.PATH}, encoding: 'utf8', timeout: 15000,
      });
      const secrets = {SESSION_SECRET: env.DOCK_RESEARCH_SESSION_SECRET};
      if (role === 'backend') secrets.OPENAI_API_KEY = env.DOCK_RESEARCH_OPENAI_KEY;
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
    const evidence = await runDockStagingResearch({
      api, emails, expectedVersion: env.DOCK_STAGING_BOOTSTRAP_VERSION_ID,
      sessionSecret: env.DOCK_RESEARCH_SESSION_SECRET,
      accessToken: env.DOCK_RESEARCH_ACCESS_TOKEN,
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
