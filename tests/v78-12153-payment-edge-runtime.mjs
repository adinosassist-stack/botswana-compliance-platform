import {__v782153Test as t} from "../cloudflare/src/worker.js";
let checks=0;const ok=(v,m)=>{if(!v)throw new Error(`FAIL: ${m}`);checks++};
const small=new Request("https://example.com/hook",{method:"POST",body:'{"ok":true}',headers:{"content-type":"application/json"}});
ok(await t.readTextBounded(small,{maxBytes:1024})==='{"ok":true}',"bounded reader returns small body exactly");
let oversized=false;try{await t.readTextBounded(new Request("https://example.com/hook",{method:"POST",body:"x".repeat(2048)}),{maxBytes:1024})}catch(e){oversized=e?.status===413&&e?.code==="payload_too_large"}
ok(oversized,"bounded reader rejects oversized streamed body");
const binary=await t.readBytesBounded(new Request("https://example.com/upload",{method:"POST",body:new Uint8Array([1,2,3,4])}),{maxBytes:8});
ok(binary instanceof Uint8Array&&binary.length===4&&binary[3]===4,"bounded binary reader preserves upload bytes");
let declaredOversized=false;try{await t.readBytesBounded(new Request("https://example.com/upload",{method:"POST",body:"x",headers:{"content-length":"4096"}}),{maxBytes:1024})}catch(e){declaredOversized=e?.status===413&&e?.code==="payload_too_large"}
ok(declaredOversized,"bounded binary reader rejects oversized declared length before buffering");
const good=t.normalizePaymentWebhookEvent({provider:"dpo",eventId:"evt_123.abc",type:"payment.succeeded"},{PAYMENT_PROVIDER:"dpo"});
ok(good?.provider==="dpo"&&good.eventId==="evt_123.abc"&&good.eventType==="payment.succeeded","payment webhook identifiers normalize");
ok(t.normalizePaymentWebhookEvent({provider:"dpo<script>",eventId:"x",type:"payment.succeeded"},{})===null,"payment webhook provider rejects unsafe characters");
ok(t.normalizePaymentWebhookEvent({provider:"dpo",eventId:"x".repeat(201),type:"payment.succeeded"},{})===null,"payment webhook event id is bounded");
ok(t.PAYMENT_ORDER_ID_RE.test("123e4567-e89b-42d3-a456-426614174000"),"payment order UUID accepted");
ok(!t.PAYMENT_ORDER_ID_RE.test("not-an-order"),"malformed payment order rejected");
const keys=[];const env={SESSION_SECRET:"s".repeat(64),PUBLIC_RATE_LIMITER:{async limit({key}){keys.push(key);return {success:true}}}};
const req=new Request("https://example.com/return",{headers:{"cf-connecting-ip":"203.0.113.9"}});
const rl=await t.edgeScopedRateLimit(req,env,"payment-return","123e4567-e89b-42d3-a456-426614174000");
ok(rl.ok&&keys.length===2,"edge limiter applies client and subject buckets");
ok(keys.every(k=>!k.includes("203.0.113.9")&&!k.includes("123e4567")),"edge limiter keys do not expose raw IP or subject");
let calls=0;const blocked=await t.edgeScopedRateLimit(req,{...env,PUBLIC_RATE_LIMITER:{async limit(){calls++;return {success:false}}}},"payment-return","123e4567-e89b-42d3-a456-426614174000");
ok(!blocked.ok&&calls===1,"client bucket blocks before subject lookup");
console.log(`V78 1.21.53 payment/edge runtime: ${checks}/${checks} PASS`);
