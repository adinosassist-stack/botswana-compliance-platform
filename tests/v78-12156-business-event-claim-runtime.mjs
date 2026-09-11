import {__v782156Test} from "../cloudflare/src/worker.js";
let checks=0;function ok(v,m){checks++;if(!v)throw new Error(`FAIL ${m}`);console.log(`PASS ${m}`)}
const state={id:"effect-1",event_id:"event-1",tenant_id:"tenant-1",status:"queued",attempts:0,started_at:null,last_error:"prior"};
const env={DB:{prepare(sql){return {bind(...args){return {async first(){
  if(!sql.includes("UPDATE business_event_effects")||!sql.includes("RETURNING *"))throw new Error("unexpected_sql");
  const [id,eventId,tenantId,expected]=args;
  if(id!==state.id||eventId!==state.event_id||tenantId!==state.tenant_id||state.status!==expected)return null;
  state.status="running";state.attempts++;state.started_at="2026-09-03T13:00:00.000Z";state.last_error=null;
  return {...state};
}}}}}}};
const effect={...state};
const first=await __v782156Test.claimBusinessEventEffect(env,effect);
const second=await __v782156Test.claimBusinessEventEffect(env,effect);
ok(first?.status==="running","first claimant acquires queued effect");
ok(first?.attempts===1,"claim increments attempt exactly once");
ok(second===null,"second concurrent claimant loses compare-and-set");
ok(state.attempts===1,"losing claimant does not increment attempts");
ok(await __v782156Test.claimBusinessEventEffect(env,{...effect,status:"completed"})===null,"completed effect cannot be claimed");
ok(typeof __v782156Test.processBusinessEventEffect==="function","runtime exports hardened processor");
console.log(`V78 1.21.56 business-event claim runtime: ${checks}/${checks} PASS`);
