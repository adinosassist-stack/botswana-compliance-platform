import fs from 'node:fs';

const harness=fs.readFileSync('scripts/production-synthetic-lifecycle.mjs','utf8');
const browser=fs.readFileSync('public/js/register-direct.js','utf8');

function must(source,pattern,label){
  if(!pattern.test(source))throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}
function mustNot(source,pattern,label){
  if(pattern.test(source))throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

must(browser,/JSON\.stringify\(\{challenge:token,counter,honeypot:/,'browser submits challenge/counter/honeypot proof');
must(harness,/return \{challenge:tokenValue,counter,honeypot:''\}/,'synthetic harness submits the same proof fields');
must(harness,/turnstileToken:JSON\.stringify\(proof\)/,'synthetic harness serializes proof through the registration field');
mustNot(harness,/return \{provider:'thebe_proof',token:tokenValue,counter,hash\}/,'obsolete synthetic proof shape is absent');

console.log('Production synthetic registration proof contract: 4/4 PASS');
