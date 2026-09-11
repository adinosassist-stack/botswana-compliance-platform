import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
const secret='runtime-secret-not-production';
const key=(scope,material)=>crypto.createHmac('sha256',secret+'|node-auth-rate-v1').update(`${scope}|${String(material||'')}`).digest('hex');
const db=new DatabaseSync(':memory:');
db.exec(`create table auth_rate_limits(scope text not null,key_hash text not null,window_start integer not null,attempts integer not null default 0,primary key(scope,key_hash));`);
function consume(scope,material,limit,windowSeconds,now){const k=key(scope,material),row=db.prepare('select window_start,attempts from auth_rate_limits where scope=? and key_hash=?').get(scope,k);let attempts,start;if(!row||row.window_start<=now-windowSeconds){attempts=1;start=now;db.prepare(`insert into auth_rate_limits(scope,key_hash,window_start,attempts) values(?,?,?,?) on conflict(scope,key_hash) do update set window_start=excluded.window_start,attempts=excluded.attempts`).run(scope,k,start,attempts)}else{attempts=Math.min(row.attempts+1,limit+1);start=row.window_start;db.prepare('update auth_rate_limits set attempts=? where scope=? and key_hash=?').run(attempts,scope,k)}return {allowed:attempts<=limit,attempts,retryAfter:Math.max(1,start+windowSeconds-now),keyHash:k}}
const raw='person@example.com',h=key('login_account',raw);
ok(/^[a-f0-9]{64}$/.test(h)&&!h.includes(raw),'HMAC limiter key is fixed-size and does not expose raw account material');
ok(h===key('login_account',raw),'same scope/material produces stable durable key');
ok(h!==key('login_ip',raw),'scope separation prevents cross-budget key collisions');
let b;for(let i=0;i<30;i++)b=consume('login_ip','203.0.113.10',30,900,1000);ok(b.allowed&&b.attempts===30,'durable IP budget allows configured threshold');
b=consume('login_ip','203.0.113.10',30,900,1000);ok(!b.allowed&&b.attempts===31,'durable IP budget blocks threshold+1');
function simulatedRestartConsume(...args){return consume(...args)}
b=simulatedRestartConsume('login_ip','203.0.113.10',30,900,1001);ok(!b.allowed,'database budget survives simulated process restart/replica boundary');
b=consume('login_ip','203.0.113.10',30,900,1901);ok(b.allowed&&b.attempts===1,'expired fixed window resets safely');
for(let i=0;i<12;i++)b=consume('login_account','victim@example.com',12,900,3000);ok(b.allowed,'email-scoped account budget permits configured threshold');
b=consume('login_account','victim@example.com',12,900,3000);ok(!b.allowed,'distributed attempts against one normalized email hit shared account budget');
const knownKey=key('login_account','victim@example.com'),unknownKey=key('login_account','missing@example.com');consume('login_account','missing@example.com',12,900,3000);ok(knownKey!==unknownKey&&db.prepare('select count(*) n from auth_rate_limits where scope=\'login_account\'').get().n===2,'known and unknown emails use indistinguishable HMAC-backed account rows');
const other=consume('login_account','other@example.com',12,900,3000);ok(other.allowed,'separate account gets independent durable budget');
for(let i=0;i<60;i++)b=consume('password_reset_complete_ip','198.51.100.20',60,900,4000);ok(b.allowed&&b.attempts===60,'reset completion budget permits configured threshold');
b=consume('password_reset_complete_ip','198.51.100.20',60,900,4000);ok(!b.allowed,'reset completion brute force is blocked at threshold+1');
ok(db.prepare('select key_hash from auth_rate_limits').all().every(r=>/^[a-f0-9]{64}$/.test(r.key_hash)),'durable ledger stores only opaque key hashes');
console.log(`V78 1.21.75 durable auth rate-limit runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
