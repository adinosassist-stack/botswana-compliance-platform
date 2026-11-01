import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {qualifyPayloads,qualifyCandidates} from '../scripts/qualify-private-backup-candidates.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const sample=Buffer.from('realistic bounded sample');
const makeSql=extra=>Buffer.from(`
CREATE TABLE tenants(id TEXT PRIMARY KEY);
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE memberships(tenant_id TEXT REFERENCES tenants(id));
CREATE TABLE sessions(id TEXT PRIMARY KEY);
CREATE TABLE audit_events(id TEXT PRIMARY KEY);
CREATE TABLE evidence(id TEXT PRIMARY KEY);
INSERT INTO tenants VALUES('fixture-tenant');
INSERT INTO users VALUES('fixture-user');
${extra||''}`);
const expected=sql=>({sql:digest(sql),sample:digest(sample)});
test('real SQLite import verifies integrity and does not emit fixture values or row counts',()=>{
  const sql=makeSql();const r=qualifyPayloads(sql,sample,expected(sql));
  assert.equal(r.tableCount,6);assert.equal(r.sqliteIntegrityPassed,true);assert.equal(r.foreignKeyViolations,0);
  assert.equal(r.remoteMutationsPerformed,false);assert.equal(r.independentlyApproved,false);
  assert.equal(r.restorePerformed,false);assert.equal(r.retentionGuaranteed,false);
  assert.match(r.rowCountsSha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(r),/fixture-tenant|fixture-user|CREATE TABLE|INSERT INTO/);
});
test('byte alteration fails before SQLite execution',()=>{
  const sql=makeSql();assert.throws(()=>qualifyPayloads(Buffer.concat([sql,Buffer.from('x')]),sample,expected(sql)),/candidate_hash/);
  assert.throws(()=>qualifyPayloads(sql,Buffer.from('wrong'),expected(sql)),/candidate_hash/);
});
test('empty, oversized or malformed UTF-8 input is rejected',()=>{
  assert.throws(()=>qualifyPayloads(Buffer.alloc(0),sample,expected(makeSql())),/candidate_size/);
  assert.throws(()=>qualifyPayloads(makeSql(),Buffer.alloc(10*1024*1024+1),expected(makeSql())),/candidate_size/);
  const bad=Buffer.from([255]);assert.throws(()=>qualifyPayloads(bad,sample,expected(bad)));
});
test('filesystem SQL, foreign-key violations and schema-only backups fail closed',()=>{
  for(const sql of [makeSql("ATTACH DATABASE '/tmp/forbidden.db' AS external;"),
    makeSql("INSERT INTO memberships VALUES('missing');"),
    Buffer.from(makeSql().toString().replace(/INSERT INTO[^;]+;/g,''))])
    assert.throws(()=>qualifyPayloads(sql,sample,expected(sql)));
});
test('missing authority prevents every provider request',async()=>{
  let calls=0;await assert.rejects(qualifyCandidates({}, {fetchImpl:async()=>{calls++;throw Error('must not run')}}),/candidate_authority/);
  assert.equal(calls,0);
});
test('exact-main drift prevents private data download',async()=>{
  const e={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_REF:'refs/heads/main',
    GITHUB_EVENT_NAME:'workflow_dispatch',QUALIFY_CONFIRM:'QUALIFY_PRIVATE_BACKUP_CANDIDATES',EXPECTED_SHA:'a'.repeat(40),
    GITHUB_SHA:'a'.repeat(40),PRIVATE_BACKUP_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',
    PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'test-only',GITHUB_TOKEN:'github-test-only'};
  const calls=[];await assert.rejects(qualifyCandidates(e,{fetchImpl:async(u,o)=>{calls.push({u,o});return Response.json({object:{sha:'b'.repeat(40)}})}}),/main_drift/);
  assert.equal(calls.length,1);assert.ok(calls[0].u.startsWith('https://api.github.com/'));
});
