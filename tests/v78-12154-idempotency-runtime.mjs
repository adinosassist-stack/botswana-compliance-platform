import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {__v782154Test as t} from "../cloudflare/src/worker.js";
let checks=0;const ok=(v,m)=>{if(!v)throw new Error(`FAIL: ${m}`);checks++};
class D1Statement{constructor(stmt){this.stmt=stmt;this.args=[]}bind(...args){this.args=args;return this}async run(){const r=this.stmt.run(...this.args);return {meta:{changes:Number(r.changes||0)}}}async first(){return this.stmt.get(...this.args)||null}async all(){return {results:this.stmt.all(...this.args)}}}
class D1Db{constructor(db){this.db=db}prepare(sql){return new D1Statement(this.db.prepare(sql))}}
const sqlite=new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY);");
sqlite.exec(fs.readFileSync(new URL("../cloudflare/migrations/039_v78_mutation_idempotency.sql",import.meta.url),"utf8"));
sqlite.prepare("INSERT INTO tenants(id) VALUES(?)").run("tenant-a");sqlite.prepare("INSERT INTO users(id) VALUES(?)").run("user-a");
const env={DB:new D1Db(sqlite)},a={tenant_id:"tenant-a",user_id:"user-a"};
const key="idem-0123456789abcdef";
const req=()=>new Request("https://app.example/api/test",{method:"POST",headers:{"idempotency-key":key}});
const first=await t.beginApiIdempotency(env,a,req(),"test-scope",{value:1});ok(first.enabled&&first.claimed,"first mutation claims idempotency key");
const inflight=await t.beginApiIdempotency(env,a,req(),"test-scope",{value:1});ok(inflight.error instanceof Response&&inflight.error.status===425,"duplicate in-flight mutation is blocked");
await t.completeApiIdempotency(env,a,first,201,{ok:true,id:"created-1"});
const replay=await t.beginApiIdempotency(env,a,req(),"test-scope",{value:1});ok(replay.replay instanceof Response&&replay.replay.status===201,"completed mutation is replayable");
const replayBody=await replay.replay.json();ok(replayBody.id==="created-1"&&replayBody.replayed===true,"replay returns original response plus replay marker");
const conflict=await t.beginApiIdempotency(env,a,req(),"test-scope",{value:2});ok(conflict.error instanceof Response&&conflict.error.status===409,"same key with changed payload conflicts");
const key2="idem-abcdef0123456789";const req2=()=>new Request("https://app.example/api/test",{method:"POST",headers:{"idempotency-key":key2}});
const failed=await t.beginApiIdempotency(env,a,req2(),"test-scope",{value:3});await t.abandonApiIdempotency(env,a,failed);
const retry=await t.beginApiIdempotency(env,a,req2(),"test-scope",{value:3});ok(retry.enabled&&retry.claimed,"abandoned failed mutation can be retried safely");
const badReq=new Request("https://app.example/api/test",{method:"POST",headers:{"idempotency-key":"short"}});const bad=await t.beginApiIdempotency(env,a,badReq,"test-scope",{});ok(bad.error instanceof Response&&bad.error.status===400,"malformed idempotency key is rejected");
const key3="idem-error0123456789";const req3=()=>new Request("https://app.example/api/test",{method:"POST",headers:{"idempotency-key":key3}});const errorResponse=await t.idempotentJsonMutation(env,a,req3(),"test-error",{value:4},async()=>({status:409,body:{error:"business_conflict"}}));ok(errorResponse.status===409,"business error is returned normally");const afterError=await t.beginApiIdempotency(env,a,req3(),"test-error",{value:4});ok(afterError.claimed===true,"business errors are not cached as completed idempotency responses");await t.abandonApiIdempotency(env,a,afterError);
const key4="idem-stale0123456789";const req4=()=>new Request("https://app.example/api/test",{method:"POST",headers:{"idempotency-key":key4}});const stale=await t.beginApiIdempotency(env,a,req4(),"test-stale",{value:5});sqlite.prepare("UPDATE api_idempotency SET created_at=datetime('now','-3 minutes') WHERE idempotency_key=?").run(key4);const recovered=await t.beginApiIdempotency(env,a,req4(),"test-stale",{value:5});ok(stale.claimed&&recovered.claimed&&recovered.recovered,"stale processing claim is recoverable after timeout window");
sqlite.close();console.log(`V78 1.21.54 idempotency runtime: ${checks}/${checks} PASS`);
