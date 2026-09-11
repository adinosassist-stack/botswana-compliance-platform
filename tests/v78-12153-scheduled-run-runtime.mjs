import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {__v782153Test as t} from "../cloudflare/src/worker.js";
let checks=0;const ok=(v,m)=>{if(!v)throw new Error(`FAIL: ${m}`);checks++};
class D1Statement{
  constructor(stmt){this.stmt=stmt;this.args=[]}
  bind(...args){this.args=args;return this}
  async run(){const r=this.stmt.run(...this.args);return {meta:{changes:Number(r.changes||0)}}}
  async first(){return this.stmt.get(...this.args)||null}
  async all(){return {results:this.stmt.all(...this.args)}}
}
class D1Db{constructor(db){this.db=db} prepare(sql){return new D1Statement(this.db.prepare(sql))}}
const sqlite=new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(new URL("../cloudflare/migrations/038_v78_scheduled_run_observability.sql",import.meta.url),"utf8"));
const env={DB:new D1Db(sqlite)};
const event={cron:"*/10 * * * *",scheduledTime:Date.UTC(2026,8,3,8,0,0)};
const a=await t.beginPlatformScheduledRun(env,event,"run-a");ok(a.ok&&a.id==="run-a"&&a.attempts===1,"first scheduled delivery claims run identity");
const duplicate=await t.beginPlatformScheduledRun(env,event,"run-b");ok(!duplicate.ok&&duplicate.skip&&duplicate.status==="running","duplicate in-flight scheduled event is skipped");
await t.finishPlatformScheduledRun(env,a.id,"completed",{processed:3});
const row=sqlite.prepare("SELECT status,attempts,summary_json FROM platform_scheduled_runs WHERE id='run-a'").get();ok(row.status==="completed"&&row.attempts===1&&JSON.parse(row.summary_json).processed===3,"completed run persists status and summary");
const completedReplay=await t.beginPlatformScheduledRun(env,event,"run-c");ok(!completedReplay.ok&&completedReplay.skip&&completedReplay.status==="completed","completed scheduled event is replay-safe");
const event2={cron:"0 * * * *",scheduledTime:Date.UTC(2026,8,3,9,0,0)};
const b=await t.beginPlatformScheduledRun(env,event2,"run-d");await t.finishPlatformScheduledRun(env,b.id,"failed",{},new Error("provider unavailable"));
const retry=await t.beginPlatformScheduledRun(env,event2,"run-e");ok(retry.ok&&retry.recovered&&retry.id==="run-d"&&retry.attempts===2,"failed scheduled event can be retried under same durable identity");
await t.finishPlatformScheduledRun(env,retry.id,"completed",{retry:true});
const retried=sqlite.prepare("SELECT status,attempts,error_summary FROM platform_scheduled_runs WHERE id='run-d'").get();ok(retried.status==="completed"&&retried.attempts===2&&retried.error_summary===null,"successful retry clears prior error and completes");
sqlite.close();
console.log(`V78 1.21.53 scheduled-run runtime: ${checks}/${checks} PASS`);
