import { proxyTrustPolicy } from "../server/proxy-trust.js";
let checks=0;const ok=(v,m)=>{if(!v)throw new Error(`FAIL: ${m}`);checks++;console.log(`PASS ${m}`)};
let p=proxyTrustPolicy();ok(p.ok&&p.hops===0&&p.expressValue===false,"missing setting defaults to no trusted proxy");
p=proxyTrustPolicy("0");ok(p.ok&&p.hops===0&&p.expressValue===false,"explicit zero ignores forwarding headers");
p=proxyTrustPolicy("1");ok(p.ok&&p.hops===1&&p.expressValue===1,"one controlled proxy hop can be explicitly enabled");
p=proxyTrustPolicy("2");ok(p.ok&&p.hops===2&&p.expressValue===2,"two controlled proxy hops can be explicitly enabled");
p=proxyTrustPolicy("3");ok(p.ok&&p.hops===3&&p.expressValue===3,"three controlled proxy hops can be explicitly enabled");
for(const bad of ["4","-1","1.5","01","","abc"]){p=proxyTrustPolicy(bad);ok(!p.ok&&p.hops===0&&p.expressValue===false,`unsafe proxy hop value ${JSON.stringify(bad)} fails closed`)}
console.log(`V78 1.21.73 Node proxy trust runtime: ${checks}/${checks} PASS`);
