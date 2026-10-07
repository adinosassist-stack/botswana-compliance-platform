import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {handleFinanceRequest} from '../../cloudflare/src/finance-core.js';
export function financeFixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO tenants VALUES('t1'),('t2'); INSERT INTO users VALUES('u1');");
  for(const name of ['044_v79_finance_reconciliation.sql','049_v108_finance_receivables.sql','058_v161_finance_suppliers_payables.sql'])sqlite.exec(fs.readFileSync('cloudflare/migrations/'+name,'utf8'));
  class Statement{
    constructor(sql){this.sql=sql;this.args=[]}
    bind(...args){this.args=args;return this}
    first(){return sqlite.prepare(this.sql).get(...this.args)||null}
    all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}
    run(){return {meta:{changes:Number(sqlite.prepare(this.sql).run(...this.args).changes)}}}
  }
  const DB={prepare:sql=>new Statement(sql),batch:statements=>{sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}};
  const audits=[];
  async function request(path,{method='GET',body,headers={}}={},auth={tenant_id:'t1',user_id:'u1',role:'owner'}){
    const req=new Request('https://thebe.test/api/finance/'+path,{method,body,headers:{'content-type':'application/json',...headers}});
    return handleFinanceRequest({request:req,url:new URL(req.url),env:{DB},auth,json:(data,status=200)=>Response.json(data,{status}),readJson:r=>r.json(),id:randomUUID,writeAudit:async(...args)=>audits.push(args),roleAllowed:(a,...roles)=>roles.includes(a.role),sha256Hex:async text=>createHash('sha256').update(text).digest('hex')});
  }
  return {sqlite,request,audits};
}
