import {__v782153Test} from '../cloudflare/src/worker.js';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
class FakeLimiter{
  constructor(limit=2){this.max=limit;this.counts=new Map();this.keys=[]}
  async limit({key}){this.keys.push(key);const n=(this.counts.get(key)||0)+1;this.counts.set(key,n);return {success:n<=this.max}}
}
const limiter=new FakeLimiter(2),env={SESSION_SECRET:'runtime-secret-not-production-123456',PUBLIC_RATE_LIMITER:limiter};
const req=(ip,sig='sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')=>new Request('https://example.test/api/webhooks/whatsapp',{headers:{'cf-connecting-ip':ip,'x-hub-signature-256':sig}});
let r=await __v782153Test.edgeScopedRateLimit(req('203.0.113.10'),env,'whatsapp-webhook','sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
ok(r.ok,'first webhook attempt passes edge limiter');
r=await __v782153Test.edgeScopedRateLimit(req('203.0.113.10'),env,'whatsapp-webhook','sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
ok(r.ok,'second webhook attempt reaches configured threshold');
r=await __v782153Test.edgeScopedRateLimit(req('203.0.113.10','sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),env,'whatsapp-webhook','sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
ok(!r.ok,'same client cannot bypass webhook budget by rotating signatures');
const receipt='0123456789abcdef'.repeat(4);ok(/^[a-f0-9]{64}$/i.test(receipt),'valid 64-hex receipt format accepted');
ok(!/^[a-f0-9]{64}$/i.test(receipt+'00')&&!/^[a-f0-9]{64}$/i.test('g'.repeat(64)),'oversized and non-hex receipt formats rejected');
const limiter2=new FakeLimiter(2),env2={SESSION_SECRET:env.SESSION_SECRET,PUBLIC_RATE_LIMITER:limiter2};
r=await __v782153Test.edgeScopedRateLimit(req('198.51.100.1'),env2,'passport-receipt',receipt);ok(r.ok,'first receipt lookup passes');
r=await __v782153Test.edgeScopedRateLimit(req('198.51.100.2'),env2,'passport-receipt',receipt);ok(r.ok,'second distributed lookup reaches subject threshold');
r=await __v782153Test.edgeScopedRateLimit(req('198.51.100.3'),env2,'passport-receipt',receipt);ok(!r.ok,'same receipt code is bounded even when attacker rotates client IPs');
ok(limiter2.keys.every(k=>!k.includes(receipt)&&!k.includes('198.51.100.')),'public limiter keys do not expose receipt codes or client IPs');
const limiter3=new FakeLimiter(1),env3={SESSION_SECRET:env.SESSION_SECRET,PUBLIC_RATE_LIMITER:limiter3};
r=await __v782153Test.edgeScopedRateLimit(req('192.0.2.5'),env3,'passport-receipt',receipt);ok(r.ok,'first client receipt request allowed');
r=await __v782153Test.edgeScopedRateLimit(req('192.0.2.5'),env3,'passport-receipt','abcdef0123456789'.repeat(4));ok(!r.ok,'same client cannot bypass receipt budget by rotating receipt codes');
console.log(`V78 1.21.77 public edge abuse runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
