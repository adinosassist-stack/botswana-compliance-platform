import assert from "node:assert/strict";
import worker from "../cloudflare/src/worker.js";
class FakeStmt{constructor(sql){this.sql=sql}bind(){return this}async run(){return {success:true}}async first(){if(this.sql.includes("SELECT count FROM auth_rate_limits"))return {count:1};return null}async all(){return {results:[]}}}
const env={SESSION_SECRET:"s".repeat(48),PUBLIC_ORIGIN:"https://app.example",DB:{prepare:sql=>new FakeStmt(sql)}};
const ctx={waitUntil(){}};
async function post(path,body){return worker.fetch(new Request(`https://app.example${path}`,{method:"POST",headers:{origin:"https://app.example","content-type":"application/json","cf-connecting-ip":"203.0.113.10"},body:JSON.stringify(body)}),env,ctx)}
let r=await post("/api/auth/register",{email:"owner@example.com",password:"x".repeat(201),companyName:"Example Ltd"});assert.equal(r.status,400);assert.equal((await r.json()).error,"invalid_registration");
r=await post("/api/auth/login",{email:"owner@example.com",password:"x".repeat(201)});assert.equal(r.status,401);assert.equal((await r.json()).error,"invalid_credentials");
r=await post("/api/auth/password-reset/complete",{token:"token",password:"x".repeat(201)});assert.equal(r.status,400);assert.equal((await r.json()).error,"invalid_reset");
console.log("V78 1.21.49 auth input runtime: 3/3 PASS");
