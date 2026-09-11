import {__v782161Test} from '../cloudflare/src/worker.js';
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL: ${m}`)};
class DB{
  constructor(){this.counts=new Map()}
  prepare(sql){
    const self=this;
    return {bind(...args){return {
      async run(){if(sql.includes('INSERT INTO auth_rate_limits')){const key=args[0];self.counts.set(key,(self.counts.get(key)||0)+1);return {meta:{changes:1}}}throw new Error('unexpected run')},
      async first(){if(sql.includes('SELECT count FROM auth_rate_limits'))return {count:self.counts.get(args[0])||0};throw new Error('unexpected first')}
    }}}
  }
}
const env={DB:new DB(),SESSION_SECRET:'x'.repeat(40)};
for(let i=0;i<6;i++){const r=await __v782161Test.authSubjectRateLimit(env,'password-reset-account','Victim@Example.com',{limit:6,windowSeconds:3600});ok(r.ok,`attempt ${i+1} allowed`)}
const blocked=await __v782161Test.authSubjectRateLimit(env,'password-reset-account','victim@example.com',{limit:6,windowSeconds:3600});ok(!blocked.ok&&Number.isInteger(blocked.retryAfterSeconds)&&blocked.retryAfterSeconds>=1&&blocked.retryAfterSeconds<=3600,'seventh normalized account attempt blocked');
const other=await __v782161Test.authSubjectRateLimit(env,'password-reset-account','other@example.com',{limit:6,windowSeconds:3600});ok(other.ok,'different account has independent budget');
const empty=await __v782161Test.authSubjectRateLimit(env,'password-reset-account','',{limit:1,windowSeconds:3600});ok(empty.ok,'empty subject bypasses account bucket safely');
console.log(`V78 1.21.61 password reset issuance runtime: ${checks}/${checks} PASS`);
