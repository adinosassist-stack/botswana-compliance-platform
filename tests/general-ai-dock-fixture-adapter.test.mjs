import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {withDockStagingFixture} from '../scripts/run-dock-staging-fixture.mjs';
import {readFileSync} from 'node:fs';
import {createDockFixtureAdapter} from '../cloudflare/src/general-ai-dock-fixture-adapter.js';
const schema=readFileSync(new URL('../cloudflare/schema/dock-hosted-staging-auth-candidate.sql',import.meta.url),'utf8');
const databaseId='11111111-2222-4333-8444-555555555555';
function setup(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(schema);
  sql.prepare("INSERT INTO dock_staging_identity VALUES(1,?,'dock-hosted-staging')").run(databaseId);
  const db={
    prepare(query){return {bind(...args){return {query,args,async first(){return sql.prepare(query).get(...args)}}}}},
    async batch(stmts){
      sql.exec('BEGIN');
      try{for(const s of stmts)sql.prepare(s.query).run(...s.args);sql.exec('COMMIT');return stmts.map(()=>({success:true}))}
      catch(e){sql.exec('ROLLBACK');throw e}
    }
  };
  const options={db,databaseId,qualifiedDatabaseId:databaseId,fixtureId:'dock-fixture-'+'a'.repeat(32),tokenHash:'b'.repeat(64),csrfToken:'c'.repeat(64)};
  return {sql,options};
}
test('isolated fixture is created once, expires within 10 minutes, cleans without deleting another fixture',async()=>{
  const {sql,options}=setup();
  const a=createDockFixtureAdapter(options),b=createDockFixtureAdapter({...options,fixtureId:'dock-fixture-'+'d'.repeat(32),tokenHash:'e'.repeat(64),csrfToken:'f'.repeat(64)});
  await a.assertAbsent();await a.create();await b.create();
  assert.equal(sql.prepare('SELECT count(*) AS n FROM sessions').get().n,2);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM sessions WHERE expires_at<=datetime(created_at,'+10 minutes')").get().n,2);
  await assert.rejects(a.create());
  await a.remove();await a.assertAbsent();
  assert.equal(sql.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
  await b.remove();await b.assertAbsent();sql.close();
});
test('wrong identity, production database and non-synthetic IDs rejected',async()=>{
  const {sql,options}=setup();
  assert.throws(()=>createDockFixtureAdapter({...options,databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',qualifiedDatabaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'}));
  assert.throws(()=>createDockFixtureAdapter({...options,fixtureId:'real-user'}));
  sql.exec("UPDATE dock_staging_identity SET database_id='wrong'");
  await assert.rejects(createDockFixtureAdapter(options).create(),/database_identity_unqualified/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM users').get().n,0);sql.close();
});

test('staging fixture hashes its session and is removed when hosted acceptance fails',async()=>{
  const {sql,options}=setup();
  try{
    const verifiedDatabaseId='c63255cf-c589-4f6b-99c7-2d2e437566b5';
    sql.prepare('UPDATE dock_staging_identity SET database_id=?').run(verifiedDatabaseId);
    const sessionSecret='offline-synthetic-staging-secret-only';
    await assert.rejects(withDockStagingFixture({db:options.db,verifiedDatabaseId,sessionSecret},async fixture=>{
      const row=sql.prepare('SELECT token_hash,csrf_token FROM sessions WHERE user_id=?').get(fixture.userId);
      assert.equal(row.token_hash,createHmac('sha256',sessionSecret).update(fixture.sessionToken).digest('hex'));
      assert.equal(row.csrf_token,fixture.csrfToken);
      assert.equal(fixture.userId,'dock-fixture-'+fixture.suffix+'-user');
      throw new Error('hosted acceptance failed');
    }),/hosted acceptance failed/);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM tenants').get().n,0);
  }finally{
    sql.close();
  }
});
