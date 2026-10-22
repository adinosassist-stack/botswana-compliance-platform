import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

export const workflow={id:'w1',name:'Onboarding reviews',routineType:'onboarding_checklist',trigger:'manual',effect:'propose_internal_task',enabled:true};
export const proposal={proposalKey:JSON.stringify(['t1','w1','e1','onboarding_checklist','2026-11-01']),workflowId:'w1',workflowName:workflow.name,employeeId:'e1',type:'onboarding_checklist',dueDate:'2026-11-01',title:'Review employee onboarding checklist',severity:'normal',effect:'propose_internal_task',status:'proposed',requiresHumanReview:true};

export function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of ['cloudflare/schema.sql','cloudflare/migrations/048_v102_bounded_internal_task_execution.sql','cloudflare/migrations/20261021_employee_ai_workflows.sql','cloudflare/migrations/20261021_employee_ai_proposal_reviews.sql','cloudflare/migrations/20261022_employee_ai_proposal_provenance.sql']){
  sql.exec(readFileSync(new URL('../../'+file,import.meta.url),'utf8'));
 }
 sql.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('t1','Tenant One');
 sql.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('t2','Tenant Two');
 for(const [id,role] of [['author','owner'],['manager','manager'],['other-author','owner']]){
  sql.prepare('INSERT INTO users(id,email) VALUES (?,?)').run(id,id+'@example.com');
  sql.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES (?,?,?,?)').run('t1',id,role,'active');
 }
 sql.prepare('INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES (?,?,?,?,?)').run('e1','t1','Synthetic employee','2026-11-01','active');
 sql.prepare('INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t1','author','w1',JSON.stringify(workflow));
 const db={
  beforeBatch:null,
  prepare(statement){
   const prepared={bind(...parameters){return {
    statement,parameters,
    async run(){const r=sql.prepare(statement).run(...parameters);return {success:true,meta:{changes:Number(r.changes)}}},
    async first(){const r=sql.prepare(statement).get(...parameters);return r?{...r}:null},
    async all(){return {success:true,results:sql.prepare(statement).all(...parameters).map(r=>({...r}))}}
   }}};
   for(const method of ['first','all','run'])prepared[method]=(...args)=>prepared.bind()[method](...args);
   return prepared;
  },
  async batch(statements){
   if(db.beforeBatch){const hook=db.beforeBatch;db.beforeBatch=null;hook(sql)}
   sql.exec('BEGIN IMMEDIATE');
   try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}
   catch(error){sql.exec('ROLLBACK');throw error}
  }
 };
 return {sql,db,close:()=>sql.close()};
}
