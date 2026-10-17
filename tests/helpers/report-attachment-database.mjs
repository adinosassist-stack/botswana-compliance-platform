import {DatabaseSync} from 'node:sqlite';
import {sqliteTelemetryEnv} from './agent-shadow-telemetry.mjs';
import {installAgentCostTestSchema} from './agent-cost-schema.mjs';
export function reportDatabase(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');installAgentCostTestSchema(db);
  db.exec(`INSERT INTO tenants(id,name) VALUES('t1','Synthetic Target'),('t2','Synthetic Other');
    INSERT INTO users(id,email) VALUES('u1','report1@example.invalid'),('u2','report2@example.invalid');
    INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','u1','owner','active'),('t2','u2','owner','active');
    INSERT INTO employees(id,tenant_id,full_name) VALUES('e1','t1','Synthetic One'),('e2','t2','Synthetic Two');
    INSERT INTO operating_locations(id,tenant_id,name) VALUES('l1','t1','Synthetic One'),('l2','t2','Synthetic Two');
    INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date)
      VALUES('report-1','t1','e1','l1','2026-10-17'),('report-2','t2','e2','l2','2026-10-17');`);
  const {DB}=sqliteTelemetryEnv(db);
  DB.batch=async statements=>{db.exec('BEGIN');try{const results=statements.map(statement=>statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}};
  return {db,DB};
}
