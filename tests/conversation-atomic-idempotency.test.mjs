import assert from "node:assert/strict";
import {appendConversationMessageRehearsal} from "../cloudflare/src/conversation-storage-rehearsal.js";
const actor={authenticated:true,active:true,userId:"u1",tenantId:"A"};
const conversation={id:"thread",tenantId:"A",status:"active"};
const membership={active:true,userId:"u1",tenantId:"A",conversationId:"thread",role:"member"};
const stored=new Map();let writes=0;
const env={DB:{prepare(sql){return {bind(...args){return {
 async run(){const key=args.slice(0,2).join(":")+":"+args[7];if(stored.has(key))return {success:true,meta:{changes:0}};stored.set(key,{id:args[2],role:args[4],source_kind:args[5],content_redacted:args[6]});writes++;return {success:true,meta:{changes:1}};},
 async first(){return stored.get(args[0]+":"+args[1]+":"+args[2])||null}
}}}}}};
const message={role:"user",sourceKind:"voice_final",content:"Show invoices",idempotencyKey:"final_1"};
const args={env,actor,conversation,membership,message};
const [a,b]=await Promise.all([appendConversationMessageRehearsal({...args,id:()=>"a"}),appendConversationMessageRehearsal({...args,id:()=>"b"})]);
assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(writes,1);
assert.equal([a.duplicate,b.duplicate].filter(Boolean).length,1);
const changed=await appendConversationMessageRehearsal({...args,message:{...message,content:"Different instruction"}});
assert.equal(changed.error,"idempotency_conflict");
assert.equal(writes,1);
console.log("Atomic idempotency retry simulation PASS");
