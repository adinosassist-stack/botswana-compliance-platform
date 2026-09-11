import {DatabaseSync} from 'node:sqlite';
let pass=0,fail=0;const ok=(v,m)=>{if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}};
const db=new DatabaseSync(':memory:');
db.exec(`
create table users(id text primary key,password_hash text,password_salt text,session_generation integer not null default 0);
create table memberships(user_id text,tenant_id text,status text,primary key(user_id,tenant_id));
create table sessions(token_hash text primary key,user_id text,tenant_id text,session_generation integer not null);
insert into users(id,password_hash,password_salt,session_generation) values('u1','old-hash','old-salt',0);
insert into memberships values('u1','t1','active');
`);
const snapshot=db.prepare("select password_hash,password_salt,session_generation from users where id='u1'").get();
const guardedIssue=db.prepare(`insert into sessions(token_hash,user_id,tenant_id,session_generation)
  select ?,?,?,session_generation from users
  where id=? and password_hash=? and session_generation=?
    and exists(select 1 from memberships where user_id=? and tenant_id=? and status='active')
  returning session_generation`);
ok(guardedIssue.get('s1','u1','t1','u1',snapshot.password_hash,snapshot.session_generation,'u1','t1')?.session_generation===0,'unchanged verified credential snapshot can issue a session');
db.exec("delete from sessions");
const stale=db.prepare("select password_hash,password_salt,session_generation from users where id='u1'").get();
db.prepare("update users set password_hash='new-hash',password_salt='new-salt',session_generation=session_generation+1 where id='u1'").run();
ok(!guardedIssue.get('stale-login','u1','t1','u1',stale.password_hash,stale.session_generation,'u1','t1'),'old-password login cannot mint a session after concurrent password reset');
ok(db.prepare("select count(*) n from sessions where token_hash='stale-login'").get().n===0,'no stale login session row is created');
const current=db.prepare("select password_hash,password_salt,session_generation from users where id='u1'").get();
ok(guardedIssue.get('fresh-login','u1','t1','u1',current.password_hash,current.session_generation,'u1','t1')?.session_generation===1,'login verified after reset can issue current-generation session');
db.exec("delete from sessions");
const beforeRehash=db.prepare("select password_hash,session_generation from users where id='u1'").get();
db.prepare("update users set password_hash='reset-won',session_generation=session_generation+1 where id='u1'").run();
const rehash=db.prepare("update users set password_hash=? where id=? and password_hash=? and session_generation=?").run('rehash-old','u1',beforeRehash.password_hash,beforeRehash.session_generation);
ok(rehash.changes===0,'stale PBKDF2 rehash loses compare-and-set after password reset');
ok(db.prepare("select password_hash h from users where id='u1'").get().h==='reset-won','password reset value is not overwritten by stale rehash');
const snap2=db.prepare("select password_hash,session_generation from users where id='u1'").get();
db.prepare("update memberships set status='inactive' where user_id='u1' and tenant_id='t1'").run();
ok(!guardedIssue.get('inactive-membership','u1','t1','u1',snap2.password_hash,snap2.session_generation,'u1','t1'),'membership revocation during login also blocks session issuance');
console.log(`V78 1.21.70 password-login/reset race runtime: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
