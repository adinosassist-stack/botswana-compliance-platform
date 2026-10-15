import {readFileSync,readdirSync} from "node:fs";

// Production bootstrap: consolidated schema through 046, then forward migrations.
// Keep constraints enabled; do not replace any production telemetry table.
export function installShadowTelemetrySchema(db){
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  for(const file of readdirSync("cloudflare/migrations")
    .filter(file=>/^\d{3}_.*\.sql$/.test(file)&&Number(file.slice(0,3))>=47).sort()){
    db.exec(readFileSync("cloudflare/migrations/"+file,"utf8"));
  }
}

export function seedShadowTelemetryFixtures(db){
  db.exec(`
    INSERT INTO tenants(id,name) VALUES('t1','Synthetic A'),('t2','Synthetic B');
    INSERT INTO users(id,email) VALUES('u1','shadow-a@example.test'),('u2','shadow-b@example.test');
    INSERT INTO memberships(tenant_id,user_id,role,status)
      VALUES('t1','u1','owner','active'),('t2','u2','owner','active');
    INSERT INTO agentic_runs(id,tenant_id,requested_by_user_id,goal,status,generation_mode,confidence,observation_json,summary)
      VALUES('r1','t1','u1','Synthetic draft','completed','deterministic_fallback','low','{}','Draft'),
            ('r2','t1','u1','Synthetic draft','completed','deterministic_fallback','low','{}','Draft'),
            ('other-run','t2','u2','Synthetic draft','completed','deterministic_fallback','low','{}','Draft');
    INSERT INTO agentic_proposals(id,tenant_id,run_id,ordinal,title,reason,priority,risk,authority,execution_policy)
      VALUES('p1','t1','r1',1,'Synthetic','Fixture','low','low','recommendation_only','not_executable_stage_1');
    INSERT INTO agentic_outcomes(id,tenant_id,run_id,proposal_id,recorded_by_user_id,outcome_status)
      VALUES('o1','t1','r1','p1','u1','observed');
  `);
}

export function sqliteTelemetryEnv(db){
  return {DB:{prepare(sql){let values=[];return {
    bind(...args){values=args;return this;},
    first(){return db.prepare(sql).get(...values);},
    all(){return {results:db.prepare(sql).all(...values)};},
    run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}
  };}}};
}
