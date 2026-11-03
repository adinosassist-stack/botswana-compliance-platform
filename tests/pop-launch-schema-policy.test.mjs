import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const status=readFileSync(new URL('../docs/LAUNCH_STATUS.md',import.meta.url),'utf8');
const pop=readFileSync(new URL('../docs/launch-pop-readiness-qualification-20261102.md',import.meta.url),'utf8');
const ci=readFileSync(new URL('../.github/workflows/audit-remediation-ci.yml',import.meta.url),'utf8');
const deployment=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const observation=readFileSync(new URL('../cloudflare/src/pop-schema-readiness.js',import.meta.url),'utf8');

test('core-only release requires a proved default-deny POP and advanced export freeze',()=>{
  assert.match(status,/Core-only exception pending independent approval/);
  assert.match(status,/If any freeze boundary is missing, release promotion is \*\*HOLD\*\*/);
  assert.match(pop,/POP 070\/071 may be deferred \*\*only for this core-only rollout\*\*/);
  assert.match(pop,/\*\*release-promotion HOLD\*\*/);
});

test('release policy never converts optional POP readiness into migration provenance or payment authority',()=>{
  assert.match(status,/neither `latestSchemaDelta` nor `popSchemaReady` alone certifies migration provenance/);
  assert.match(pop,/not proof of applying a migration/);
  assert.match(pop,/Customer-submitted references and uploads never verify payment receipt/);
  assert.match(observation,/SELECT name,type FROM sqlite_master/);
  assert.match(observation,/PRAGMA table_info/);
  assert.doesNotMatch(observation,/\.run\s*\(/);
});

test('protected deployment remains exact-authority gated and required audit CI checks this contract',()=>{
  assert.match(deployment,/environment: production/);
  assert.match(deployment,/BF-07 Supply-Chain Seal/);
  assert.match(deployment,/ready\.schemaReady !== true/);
  assert.match(ci,/node --test tests\/pop-launch-schema-policy\.test\.mjs/);
});
