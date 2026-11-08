import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyThebeLifeStaging} from '../cloudflare/src/thebe-life-staging-preflight.js';
const productionDatabaseId='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const stagingDatabaseId='9d1b8852-4424-46e9-ba24-cdad5ced215f';
const sha='a'.repeat(40);
const names=['life_households','life_household_members','life_household_entries','life_motshelo_groups','life_motshelo_members','life_motshelo_contributions'];
function safeEnv(){
  return {APP_ENV:'staging',DEPLOYMENT_PROFILE:'thebe-life-private-staging',
    THEBE_LIFE_HOUSEHOLD_ENABLED:'false',THEBE_LIFE_INSURANCE_ENABLED:'false',
    THEBE_LIFE_MOTSHELO_PAYMENTS_ENABLED:'false',LIFE_STAGING_PUBLIC_ROUTES_ENABLED:'false',
    LIFE_D1_DATABASE_ID:stagingDatabaseId,LIFE_STAGING_SOURCE_SHA:sha,LIFE_STAGING_DATA_CLASS:'synthetic-only',
    LIFE_DB:{prepare(sql){assert.match(sql,/^SELECT name FROM sqlite_master/);return {all:async()=>({results:names.map(name=>({name}))})};}}
  };
}
const qualify=env=>qualifyThebeLifeStaging({env,productionDatabaseId,expectedSourceSha:sha});
test('read-only staging qualification succeeds with synthetic isolated schema',async()=>{
  assert.deepEqual(await qualify(safeEnv()),{ready:true,failures:[]});
});
test('refuses production environment and reused production D1',async()=>{
  const env={...safeEnv(),APP_ENV:'production',LIFE_D1_DATABASE_ID:productionDatabaseId};
  const out=await qualify(env);
  assert.equal(out.ready,false);assert.ok(out.failures.includes('not_staging'));assert.ok(out.failures.includes('d1_not_isolated'));
});
test('refuses payment activation, insurer activation and public routes',async()=>{
  const env={...safeEnv(),THEBE_LIFE_MOTSHELO_PAYMENTS_ENABLED:'true',THEBE_LIFE_INSURANCE_ENABLED:'true',LIFE_STAGING_PUBLIC_ROUTES_ENABLED:'true'};
  assert.equal((await qualify(env)).failures.length,3);
});
test('fails closed on untrusted source SHA or missing tables',async()=>{
  const bad={...safeEnv(),LIFE_STAGING_SOURCE_SHA:'b'.repeat(40)};
  assert.ok((await qualify(bad)).failures.includes('source_sha_unverified'));
  const missing=safeEnv();missing.LIFE_DB={prepare:()=>({all:async()=>({results:[{name:'life_households'}]})})};
  assert.ok((await qualify(missing)).failures.includes('missing_life_motshelo_groups'));
});
test('fails closed on database errors',async()=>{
  const env=safeEnv();env.LIFE_DB={prepare:()=>({all:async()=>{throw Error('unavailable')}})};
  assert.deepEqual(await qualify(env),{ready:false,failures:['staging_d1_read_failed']});
});
