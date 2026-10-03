import assert from "node:assert/strict";
import {appendSealedAuditEvent,stableAuditJson} from "../cloudflare/src/audit-lineage-writer.js";
import {createGptLivePreviewSession} from "../cloudflare/src/agentic-live-preview.js";

function makeDb({failBatch=false}={}){
  let state=null;
  const events=[];
  const failures=[];
  const prepared=[];
  return {
    events,
    failures,
    prepared,
    prepare(sql){
      const statement={
        sql:String(sql),
        args:[],
        bind(...args){
          const bound={
            sql:statement.sql,
            args,
            async first(){
              if(statement.sql.includes("FROM audit_chain_state"))return state;
              return null;
            },
            async run(){
              if(statement.sql.includes("INSERT INTO audit_write_failures"))failures.push(args);
              return {success:true};
            }
          };
          prepared.push(bound);
          return bound;
        }
      };
      return statement;
    },
    async batch(statements){
      if(failBatch)throw new Error("simulated_batch_failure");
      const insert=statements.find(item=>item.sql.includes("INSERT INTO audit_events"));
      const update=statements.find(item=>item.sql.includes("INSERT INTO audit_chain_state"));
      assert.ok(insert,"sealed audit insert must be batched");
      assert.ok(update,"audit chain state update must be batched with insert");
      events.push({
        tenantId:insert.args[0],
        actorUserId:insert.args[1],
        eventType:insert.args[2],
        entityType:insert.args[3],
        entityId:insert.args[4],
        eventData:insert.args[5],
        occurredAt:insert.args[6],
        seq:insert.args[7],
        prevHash:insert.args[8],
        eventHash:insert.args[9],
        writeSource:insert.args[10]
      });
      state={last_hash:update.args[1],event_count:update.args[2]};
      return [{success:true},{success:true}];
    }
  };
}

assert.equal(stableAuditJson({z:1,a:{d:4,b:2}}),'{"a":{"b":2,"d":4},"z":1}');

const db=makeDb();
const auditEnv={DB:db,AUDIT_INTEGRITY_SECRET:"audit-secret-v272"};
const first=await appendSealedAuditEvent(auditEnv,{
  tenantId:"tenant-1",
  actorUserId:"user-1",
  eventType:"FIRST",
  entityType:"test",
  entityId:"one",
  eventData:{z:2,a:1},
  writeSource:"v272_test"
});
const second=await appendSealedAuditEvent(auditEnv,{
  tenantId:"tenant-1",
  actorUserId:"user-1",
  eventType:"SECOND",
  entityType:"test",
  entityId:"two",
  eventData:{ok:true},
  writeSource:"v272_test"
});
assert.equal(first.seq,1);
assert.equal(first.prevHash,"GENESIS");
assert.equal(second.seq,2);
assert.equal(second.prevHash,first.eventHash);
assert.notEqual(second.eventHash,first.eventHash);
assert.equal(db.events[0].writeSource,"v272_test");
assert.equal(db.events[0].eventData,'{"a":1,"z":2}');
assert.equal(db.events[0].seq,1);
assert.equal(db.events[1].seq,2);
assert.ok(db.events.every(event=>/^[0-9a-f]{64}$/.test(event.eventHash)));

const originalFetch=globalThis.fetch;
try{
  const sessionDb=makeDb();
  let providerCalled=0;
  globalThis.fetch=async()=>{
    providerCalled+=1;
    return new Response(JSON.stringify({
      id:"live_audit_123",
      transport:{type:"webrtc",sdp:"v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n"}
    }),{status:200,headers:{"content-type":"application/json"}});
  };
  const env={
    DB:sessionDb,
    AUDIT_INTEGRITY_SECRET:"audit-secret-preview",
    THEBE_LIVE_VOICE_ENABLED:"1",
    THEBE_GPT_LIVE_PREVIEW_ENABLED:"1",
    THEBE_LIVE_VOICE_RUNTIME:"gpt_live_preview",
    AGENT_RUNTIME_ENABLED:"1",
    OPENAI_API_KEY:"sk-test-this-is-long-enough-for-config-check"
  };
  const auth={tenant_id:"tenant-preview",user_id:"owner-preview"};
  const request=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sdp:"v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n"})
  });
  const response=await createGptLivePreviewSession({request,env,auth});
  assert.equal(response.status,200);
  assert.equal(providerCalled,1);
  assert.deepEqual(sessionDb.events.map(event=>event.eventType),[
    "THEBE_LIVE_SESSION_REQUESTED",
    "THEBE_LIVE_SESSION_STARTED"
  ]);
  assert.deepEqual(sessionDb.events.map(event=>event.seq),[1,2]);
  assert.equal(sessionDb.events[1].prevHash,sessionDb.events[0].eventHash);
  assert.ok(sessionDb.events.every(event=>event.writeSource==="gpt_live_preview"));
  assert.ok(sessionDb.events.every(event=>event.entityType==="thebe_live_session"));

  const brokenDb=makeDb({failBatch:true});
  let unsafeProviderCall=false;
  globalThis.fetch=async()=>{unsafeProviderCall=true;throw new Error("provider must not be reached")};
  const brokenEnv={...env,DB:brokenDb};
  const brokenRequest=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sdp:"v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n"})
  });
  const brokenResponse=await createGptLivePreviewSession({request:brokenRequest,env:brokenEnv,auth});
  assert.equal(brokenResponse.status,503);
  assert.equal((await brokenResponse.json()).error,"gpt_live_preview_audit_unavailable");
  assert.equal(unsafeProviderCall,false,"preview provider must not be called when the requested-session audit cannot be sealed");
  assert.equal(brokenDb.failures.length,1,"canonical writer should record an audit write failure after bounded retries");
}finally{
  globalThis.fetch=originalFetch;
}

console.log("PASS: V272 GPT-Live preview audit events are sealed into the canonical tenant lineage and fail closed before provider access");
