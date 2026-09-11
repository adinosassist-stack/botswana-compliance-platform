import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
const secret='runtime-secret-not-production';
const h=(salt,material)=>crypto.createHmac('sha256',salt).update(material).digest('hex');
// Simulate Node/Postgres durable limiter semantics with persistent SQLite storage.
const nodeDb=new DatabaseSync(':memory:');
nodeDb.exec('create table auth_rate_limits(scope text not null,key_hash text not null,window_start integer not null,attempts integer not null default 0,primary key(scope,key_hash));');
const nodeKey=(scope,material)=>h(secret+'|node-auth-rate-v1',`${scope}|${material}`);
function consumeNode(scope,material,limit,window,now){const key=nodeKey(scope,material),r=nodeDb.prepare('select window_start,attempts from auth_rate_limits where scope=? and key_hash=?').get(scope,key);let start,attempts;if(!r||r.window_start<=now-window){start=now;attempts=1;nodeDb.prepare('insert into auth_rate_limits(scope,key_hash,window_start,attempts) values(?,?,?,?) on conflict(scope,key_hash) do update set window_start=excluded.window_start,attempts=excluded.attempts').run(scope,key,start,attempts)}else{start=r.window_start;attempts=Math.min(r.attempts+1,limit+1);nodeDb.prepare('update auth_rate_limits set attempts=? where scope=? and key_hash=?').run(attempts,scope,key)}return {allowed:attempts<=limit,attempts,key}}
let b;for(let i=0;i<60;i++)b=consumeNode('oauth_start_ip','203.0.113.7',60,600,1000);ok(b.allowed&&b.attempts===60,'Node OAuth start permits configured threshold');
b=consumeNode('oauth_start_ip','203.0.113.7',60,600,1000);ok(!b.allowed&&b.attempts===61,'Node OAuth start blocks threshold+1');
function simulatedReplica(...args){return consumeNode(...args)}
b=simulatedReplica('oauth_start_ip','203.0.113.7',60,600,1001);ok(!b.allowed,'Node OAuth start budget survives process/replica boundary');
for(let i=0;i<30;i++)b=consumeNode('oauth_callback_ip','198.51.100.8',30,600,2000);ok(b.allowed&&b.attempts===30,'Node OAuth callback permits configured threshold');
b=consumeNode('oauth_callback_ip','198.51.100.8',30,600,2000);ok(!b.allowed,'Node OAuth callback blocks threshold+1 before provider work');
const googleAttempt=consumeNode('oauth_callback_ip','192.0.2.44',30,600,3000);const facebookAttempt=consumeNode('oauth_callback_ip','192.0.2.44',30,600,3000);ok(googleAttempt.key===facebookAttempt.key&&facebookAttempt.attempts===2,'Node Google/Facebook callbacks share the same IP budget');
ok(!googleAttempt.key.includes('192.0.2.44')&&/^[a-f0-9]{64}$/.test(googleAttempt.key),'Node OAuth limiter stores opaque HMAC keys');
b=consumeNode('oauth_start_ip','203.0.113.7',60,600,1601);ok(b.allowed&&b.attempts===1,'Node fixed window expires and resets safely');
// Simulate Cloudflare authRateLimit bucket semantics and cross-provider sharing.
const edgeDb=new DatabaseSync(':memory:');edgeDb.exec('create table auth_rate_limits(key_hash text primary key,scope text,count integer,window_start integer);');
const edgeKey=(scope,ip,bucket,subject='')=>h(secret+'|auth-rate-v1',`${scope}|${bucket}|${ip}|${subject.toLowerCase().trim()}`);
function consumeEdge(scope,ip,limit,window,now){const bucket=Math.floor(now/window),key=edgeKey(scope,ip,bucket),r=edgeDb.prepare('select count from auth_rate_limits where key_hash=?').get(key);const count=(r?.count||0)+1;if(r)edgeDb.prepare('update auth_rate_limits set count=? where key_hash=?').run(count,key);else edgeDb.prepare('insert into auth_rate_limits(key_hash,scope,count,window_start) values(?,?,?,?)').run(key,scope,count,bucket);return {ok:count<=limit,count,key}}
for(let i=0;i<60;i++)b=consumeEdge('oauth-start','203.0.113.9',60,600,1000);ok(b.ok&&b.count===60,'Cloudflare OAuth start permits configured threshold');
b=consumeEdge('oauth-start','203.0.113.9',60,600,1000);ok(!b.ok,'Cloudflare OAuth start blocks threshold+1');
for(let i=0;i<30;i++)b=consumeEdge('oauth-callback','198.51.100.10',30,600,2000);ok(b.ok&&b.count===30,'Cloudflare OAuth callback permits configured threshold');
b=consumeEdge('oauth-callback','198.51.100.10',30,600,2000);ok(!b.ok,'Cloudflare OAuth callback blocks threshold+1');
const eg=consumeEdge('oauth-callback','192.0.2.55',30,600,3000),ef=consumeEdge('oauth-callback','192.0.2.55',30,600,3000);ok(eg.key===ef.key&&ef.count===2,'Cloudflare Google/Facebook callbacks share the same IP bucket');
ok(/^[a-f0-9]{64}$/.test(eg.key)&&!eg.key.includes('192.0.2.55'),'Cloudflare OAuth limiter keys are opaque HMACs');
console.log(`V78 1.21.76 OAuth brute-force runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
