import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';

const {Client}=pg;
const connectionString=process.env.DATABASE_URL;
assert.ok(connectionString,'DATABASE_URL is required');
const client=new Client({connectionString});
await client.connect();

const columnType=async(table,column)=>{
  const {rows}=await client.query(`
    select data_type
    from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2
  `,[table,column]);
  return rows[0]?.data_type||null;
};

try{
  assert.equal(await columnType('app_state','version'),'integer','fresh migrated app_state.version must be integer');
  assert.equal(await columnType('management_rereview_queue','tenant_id'),'uuid','rereview tenant_id must be uuid');
  assert.equal(await columnType('management_rereview_queue','reviewer_user_id'),'uuid','rereview reviewer_user_id must be uuid');

  const {rows:constraints}=await client.query(`
    select pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='management_rereview_queue'
  `);
  assert.ok(constraints.length>0,'rereview constraints must exist');
  assert.ok(constraints.every(row=>!String(row.definition||'').includes('management_review_decisions')),'rereview constraints must not reference absent management_review_decisions');

  const {rows:migrationRows}=await client.query(`select 1 from schema_migrations where version='032_v82_workspace_version_numeric_contract.sql'`);
  assert.equal(migrationRows.length,1,'workspace-version migration must be recorded as applied');

  const migrationSql=fs.readFileSync('db/migrations/032_v82_workspace_version_numeric_contract.sql','utf8');

  await client.query('delete from app_state');
  await client.query('alter table app_state alter column version type bigint using version::bigint');
  assert.equal(await columnType('app_state','version'),'bigint','legacy bigint shape must be reproducible');
  await client.query(migrationSql);
  assert.equal(await columnType('app_state','version'),'integer','valid legacy bigint shape must convert to integer');

  await client.query('alter table app_state alter column version type bigint using version::bigint');
  const {rows:[tenant]}=await client.query(`insert into tenants(name) values('V82 unsafe version guard') returning id`);
  await client.query(`insert into app_state(tenant_id,state,version) values($1,'{}'::jsonb,2147483648)`,[tenant.id]);
  let unsafeRejected=false;
  try{await client.query(migrationSql)}catch(error){unsafeRejected=/cannot be safely converted to integer/i.test(String(error?.message||error))}
  assert.equal(unsafeRejected,true,'out-of-range legacy workspace version must fail closed');
  assert.equal(await columnType('app_state','version'),'bigint','failed unsafe conversion must leave legacy type unchanged');

  await client.query('delete from app_state where tenant_id=$1',[tenant.id]);
  await client.query('delete from tenants where id=$1',[tenant.id]);
  await client.query(migrationSql);
  assert.equal(await columnType('app_state','version'),'integer','workspace version must return to integer after unsafe data is removed');

  console.log('V82 Node/Postgres runtime lineage + workspace-version migration PASS');
} finally {
  await client.end();
}
