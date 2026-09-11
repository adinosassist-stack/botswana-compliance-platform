import {__v782180Test} from '../cloudflare/src/worker.js';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
class DB{
  constructor(){this.rows=new Map();this.writes=[]}
  prepare(sql){const self=this;return {bind(...args){return {
    async run(){if(!sql.includes('INSERT INTO auth_rate_limits'))throw new Error(`unexpected run: ${sql}`);const [key,scope]=args;const prev=self.rows.get(key)||{count:0,scope};self.rows.set(key,{count:prev.count+1,scope});self.writes.push({key,scope,args});return {meta:{changes:1}}},
    async first(){if(!sql.includes('SELECT count FROM auth_rate_limits'))throw new Error(`unexpected first: ${sql}`);return {count:self.rows.get(args[0])?.count||0}}
  }}}}
}
const env={DB:new DB(),SESSION_SECRET:'runtime-secret-'.padEnd(48,'x')};
let r;
// Rotating source IP is intentionally not an input to authSubjectRateLimit. All attempts at one normalized email share one bucket.
const rotatingIps=Array.from({length:11},(_,i)=>`203.0.113.${i+1}`);
for(let i=0;i<10;i++){void rotatingIps[i];r=await __v782180Test.authSubjectRateLimit(env,'login-account',i%2?'Victim@Example.com':' victim@example.com ',{limit:10,windowSeconds:600});ok(r.ok,`rotating-IP account attempt ${i+1} allowed within threshold`)}
void rotatingIps[10];r=await __v782180Test.authSubjectRateLimit(env,'login-account','VICTIM@example.com',{limit:10,windowSeconds:600});ok(!r.ok&&Number.isInteger(r.retryAfterSeconds)&&r.retryAfterSeconds>=1&&r.retryAfterSeconds<=600,'threshold+1 blocked even when attacker rotates IP');
ok(env.DB.rows.size===1,'all normalized victim-email attempts share one D1 account bucket');
const [victimKey]=env.DB.rows.keys();ok(/^[a-f0-9]{64}$/.test(victimKey)&&!victimKey.includes('victim@example.com'),'D1 account key is opaque HMAC rather than raw email');
r=await __v782180Test.authSubjectRateLimit(env,'login-account','other@example.com',{limit:10,windowSeconds:600});ok(r.ok&&env.DB.rows.size===2,'different account receives independent budget');
for(let i=0;i<10;i++)await __v782180Test.authSubjectRateLimit(env,'login-account','missing@example.com',{limit:10,windowSeconds:600});r=await __v782180Test.authSubjectRateLimit(env,'login-account','missing@example.com',{limit:10,windowSeconds:600});ok(!r.ok,'nonexistent-looking email is throttled with same subject mechanism');
ok(env.DB.writes.every(x=>!JSON.stringify(x.args).toLowerCase().includes('@example.com')),'raw email is never written to limiter SQL parameters');
r=await __v782180Test.authSubjectRateLimit(env,'login-account','',{limit:1,windowSeconds:600});ok(r.ok,'empty subject bypasses subject bucket safely; route validation rejects it separately');
console.log(`V78 1.21.80 Cloudflare account-throttle runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
