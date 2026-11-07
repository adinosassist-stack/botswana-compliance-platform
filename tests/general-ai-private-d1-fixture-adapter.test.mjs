import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPrivateGeneralAiFixtureAdapter} from '../cloudflare/src/general-ai-private-d1-fixture-adapter.js';
import {withPrivateSyntheticFixture} from '../cloudflare/src/general-ai-private-fixture-lifecycle.js';

const fixtureId='ga-test-'+'b'.repeat(32),tokenHash='c'.repeat(64),csrfToken='synthetic-csrf-value-long-enough-for-test';
const scope={appEnv:'staging',databaseId:'ff229eef-7724-49ae-9d68-d3a1db669b63',workerName:'bw-general-ai-staging',generalAiEnabled:false,researchEnabled:false,publicRouteEnabled:false,independentApproval:true,stagingWriteApproved:true,exactMainApproved:true};
function makeDB(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,session_generation INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE memberships(user_id TEXT NOT NULL REFERENCES users(id),tenant_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(user_id,tenant_id));
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),tenant_id TEXT NOT NULL,csrf_token TEXT NOT NULL,session_generation INTEGER NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id));`);
  return {sql,db:{prepare(q){return {bind(...p){const stmt=sql.prepare(q);return {run:()=>stmt.run(...p),first:()=>stmt.get(...p)}}}}}};
}
const args={fixtureId,tokenHash,csrfToken,expiresAt:'2026-11-07 21:00:00'};
test('real SQLite creates only fixture-owned rows and verifies cleanup',async()=>{
  const {sql,db}=makeDB();
  try{const adapter=createPrivateGeneralAiFixtureAdapter({db,...args});
    const r=await withPrivateSyntheticFixture({scope,fixtureId,adapter,exercise:async()=>{assert.equal(sql.prepare('SELECT count(*) n FROM sessions').get().n,1);return 'ok'}});
    assert.equal(r.cleanupVerified,true);assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,0)
  }finally{sql.close()}
});
test('cleanup preserves unrelated records',async()=>{
  const {sql,db}=makeDB();
  try{sql.prepare('INSERT INTO users(id,email) VALUES (?,?)').run('existing','existing@example.invalid');
    const adapter=createPrivateGeneralAiFixtureAdapter({db,...args});
    await withPrivateSyntheticFixture({scope,fixtureId,adapter,exercise:async()=>null});
    assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,1);
    assert.equal(sql.prepare('SELECT email FROM users WHERE id=?').get('existing').email,'existing@example.invalid')
  }finally{sql.close()}
});
test('partial-write injection cleans both already-created records',async()=>{
  const {sql,db}=makeDB();
  try{const inner=createPrivateGeneralAiFixtureAdapter({db,...args});
    const adapter={...inner,async create(kind,id){await inner.create(kind,id);if(kind==='membership')throw Error('injected_failure')}};
    await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter,exercise:async()=>null}),/injected_failure/);
    assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,0);
    assert.equal(sql.prepare('SELECT count(*) n FROM memberships').get().n,0)
  }finally{sql.close()}
});
test('rejects unsafe identifiers, token hash and CSRF values',()=>{
  const {sql,db}=makeDB();
  try{assert.throws(()=>createPrivateGeneralAiFixtureAdapter({db,...args,tokenHash:'oops'}),/fixture_token_hash_required/);
    assert.throws(()=>createPrivateGeneralAiFixtureAdapter({db,...args,fixtureId:'real-client'}),/fixture_synthetic_id_required/);
    assert.throws(()=>createPrivateGeneralAiFixtureAdapter({db,...args,csrfToken:'short'}),/fixture_csrf_required/)
  }finally{sql.close()}
});
