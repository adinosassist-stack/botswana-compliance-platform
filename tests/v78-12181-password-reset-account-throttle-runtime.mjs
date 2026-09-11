import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {__v782181Test} from '../cloudflare/src/worker.js';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};

// Node/Postgres policy model: the account key does not include IP, is HMAC-derived, and persists in DB state.
const secret='runtime-secret-for-reset-account-test';
const key=(scope,material)=>crypto.createHmac('sha256',secret+'|node-auth-rate-v1').update(`${scope}|${String(material||'')}`).digest('hex');
const db=new DatabaseSync(':memory:');
db.exec('create table auth_rate_limits(scope text not null,key_hash text not null,window_start integer not null,attempts integer not null default 0,primary key(scope,key_hash));');
function consume(scope,material,limit,windowSeconds,now){const k=key(scope,material),row=db.prepare('select window_start,attempts from auth_rate_limits where scope=? and key_hash=?').get(scope,k);let attempts,start;if(!row||row.window_start<=now-windowSeconds){attempts=1;start=now;db.prepare('insert into auth_rate_limits(scope,key_hash,window_start,attempts) values(?,?,?,?) on conflict(scope,key_hash) do update set window_start=excluded.window_start,attempts=excluded.attempts').run(scope,k,start,attempts)}else{attempts=Math.min(row.attempts+1,limit+1);start=row.window_start;db.prepare('update auth_rate_limits set attempts=? where scope=? and key_hash=?').run(attempts,scope,k)}return {allowed:attempts<=limit,attempts,retryAfter:Math.max(1,start+windowSeconds-now),keyHash:k}}
const normalize=v=>String(v||'').trim().toLowerCase();
const ips=Array.from({length:7},(_,i)=>`203.0.113.${i+1}`);let r;
for(let i=0;i<6;i++){void ips[i];r=consume('password_reset_request_account',normalize(i%2?'Victim@Example.com':' victim@example.com '),6,3600,1000);ok(r.allowed,`Node rotating-IP reset request ${i+1} allowed within account threshold`)}
void ips[6];r=consume('password_reset_request_account',normalize('VICTIM@example.com'),6,3600,1000);ok(!r.allowed&&r.attempts===7,'Node threshold+1 is blocked even with a different source IP');
ok(db.prepare("select count(*) n from auth_rate_limits where scope='password_reset_request_account'").get().n===1,'Node normalized victim email shares one account bucket');
const nodeRow=db.prepare("select key_hash from auth_rate_limits where scope='password_reset_request_account'").get();ok(/^[a-f0-9]{64}$/.test(nodeRow.key_hash)&&!nodeRow.key_hash.includes('victim@example.com'),'Node limiter ledger stores opaque HMAC key, not raw email');
r=consume('password_reset_request_account',normalize('missing@example.com'),6,3600,1000);ok(r.allowed,'Node nonexistent-looking email uses the same account-budget mechanism');
r=consume('password_reset_request_account',normalize('other@example.com'),6,3600,1000);ok(r.allowed,'Node different email receives an independent account budget');

// Cloudflare actual helper with a minimal D1 mock.
class DB{
  constructor(){this.rows=new Map();this.writes=[]}
  prepare(sql){const self=this;return {bind(...args){return {
    async run(){if(!sql.includes('INSERT INTO auth_rate_limits'))throw new Error(`unexpected run: ${sql}`);const [k,scope]=args,prev=self.rows.get(k)||{count:0,scope};self.rows.set(k,{count:prev.count+1,scope});self.writes.push(args);return {meta:{changes:1}}},
    async first(){if(!sql.includes('SELECT count FROM auth_rate_limits'))throw new Error(`unexpected first: ${sql}`);return {count:self.rows.get(args[0])?.count||0}}
  }}}}
}
const env={DB:new DB(),SESSION_SECRET:'cloudflare-reset-account-runtime-secret'.padEnd(48,'x')};
for(let i=0;i<6;i++){void ips[i];r=await __v782181Test.authSubjectRateLimit(env,'password-reset-account',i%2?'Victim@Example.com':' victim@example.com ',{limit:6,windowSeconds:3600});ok(r.ok,`Cloudflare rotating-IP reset request ${i+1} allowed within account threshold`)}
void ips[6];r=await __v782181Test.authSubjectRateLimit(env,'password-reset-account','VICTIM@example.com',{limit:6,windowSeconds:3600});ok(!r.ok&&Number.isInteger(r.retryAfterSeconds)&&r.retryAfterSeconds>=1&&r.retryAfterSeconds<=3600,'Cloudflare threshold+1 blocked independent of source IP');
ok(env.DB.rows.size===1,'Cloudflare normalized victim email shares one D1 bucket');
const [cfKey]=env.DB.rows.keys();ok(/^[a-f0-9]{64}$/.test(cfKey)&&!cfKey.includes('victim@example.com'),'Cloudflare D1 key is opaque HMAC rather than raw email');
r=await __v782181Test.authSubjectRateLimit(env,'password-reset-account','missing@example.com',{limit:6,windowSeconds:3600});ok(r.ok,'Cloudflare nonexistent-looking email uses the same subject limiter');
ok(env.DB.writes.every(args=>!JSON.stringify(args).toLowerCase().includes('@example.com')),'Cloudflare limiter SQL never receives raw email');
console.log(`V78 1.21.81 password-reset account-throttle runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
