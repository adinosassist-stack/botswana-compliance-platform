import assert from "node:assert/strict";
import fs from "node:fs";
import {__agenticLiveVoiceTest as live} from "../cloudflare/src/agentic-live-voice.js";

const source=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(source,/activeOwnedLiveSession/);
assert.match(source,/live_session_owner_mismatch/);
assert.match(source,/live_session_expired/);
assert.match(source,/THEBE_LIVE_DELEGATION_DENIED/);
assert.match(source,/executionPerformed:false/);

function envFor(row){
  return {THEBE_LIVE_VOICE_MAX_SESSION_SECONDS:"600",DB:{prepare(){return {bind(){return {first:async()=>row}}}}}};
}
const auth={tenant_id:"tenant-a",user_id:"owner-a"};
const now=new Date();
const sqlDate=d=>d.toISOString().replace("T"," ").replace("Z","");

assert.equal((await live.activeOwnedLiveSession(envFor(null),auth,"s1")).code,"live_session_not_active");
assert.equal((await live.activeOwnedLiveSession(envFor({actor_user_id:"owner-b",event_type:"THEBE_LIVE_SESSION_STARTED",created_at:sqlDate(now)}),auth,"s1")).code,"live_session_owner_mismatch");
assert.equal((await live.activeOwnedLiveSession(envFor({actor_user_id:"owner-a",event_type:"THEBE_LIVE_SESSION_FAILED",created_at:sqlDate(now)}),auth,"s1")).code,"live_session_not_active");
const old=new Date(Date.now()-12*60*1000);
assert.equal((await live.activeOwnedLiveSession(envFor({actor_user_id:"owner-a",event_type:"THEBE_LIVE_SESSION_STARTED",created_at:sqlDate(old)}),auth,"s1")).code,"live_session_expired");
assert.equal((await live.activeOwnedLiveSession(envFor({actor_user_id:"owner-a",event_type:"THEBE_LIVE_SESSION_STARTED",created_at:sqlDate(now)}),auth,"s1")).ok,true);
console.log("V260_REDTEAM_LIVE_SESSION_BINDING_PASS");
