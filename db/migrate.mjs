import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
  await pool.query(`create table if not exists schema_migrations(version text primary key, applied_at timestamptz not null default now())`);
  const files=fs.readdirSync(new URL('./migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort();
  for(const file of files){
    const done=await pool.query('select 1 from schema_migrations where version=$1',[file]);
    if(done.rowCount) continue;
    const sql=fs.readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8');
    const c=await pool.connect();
    try{await c.query('begin');await c.query(sql);await c.query('insert into schema_migrations(version) values($1)',[file]);await c.query('commit');console.log('Applied',file)}catch(e){await c.query('rollback');throw e}finally{c.release()}
  }
}finally{await pool.end()}
