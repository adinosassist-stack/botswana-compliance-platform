import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const planner = join(root, 'scripts/plan-production-pop-070-071.mjs');
const paths = ['cloudflare/migrations/070_payment_pop_documents.sql', 'cloudflare/migrations/071_payment_pop_runtime_compat.sql'];
const sources = paths.map(path => readFileSync(join(root, path), 'utf8'));

function run(sql = sources) {
  const cwd = mkdtempSync(join(tmpdir(), 'pop-preflight-'));
  try {
    mkdirSync(join(cwd, 'cloudflare/migrations'), {recursive: true});
    paths.forEach((path, index) => writeFileSync(join(cwd, path), sql[index]));
    return spawnSync(process.execPath, [planner], {cwd, encoding: 'utf8'});
  } finally {
    rmSync(cwd, {recursive: true, force: true});
  }
}

test('reviewed 070/071 foreign-key deletion policies pass without authorizing writes', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.ordered_paths, paths);
  assert.equal(report.required_additive_071_columns, 12);
  for (const key of ['production_target_contacted', 'backup_confirmed', 'production_write_authorized', 'mutation_performed']) {
    assert.equal(report[key], false, key);
  }
});

for (const [index, mutation] of [
  [0, '\nDELETE FROM payment_orders;'],
  [1, '\nUPDATE subscriptions SET status=\'active\';'],
  [1, '\n/* hidden statement */ DELETE/**/FROM payment_orders;'],
  [0, '\nCREATE TRIGGER unsafe AFTER INSERT ON payment_pop_documents BEGIN DELETE FROM payment_orders; END;'],
  [1, '\nDROP TABLE payment_orders;'],
  [0, '\n-- even non-executable source changes need checksum review\n'],
]) {
  test(`source drift in ${index + 70} fails closed: ${mutation.trim().slice(0, 55)}`, () => {
    const sql = [...sources];
    sql[index] += mutation;
    const result = run(sql);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  });
}
