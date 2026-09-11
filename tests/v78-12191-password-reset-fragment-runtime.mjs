import assert from 'node:assert/strict';
import {buildPasswordResetUrl} from '../server/public-app-url.js';
let pass=0;const ok=(v,m)=>{assert.ok(v,m);console.log('PASS',m);pass++};
const url=buildPasswordResetUrl('https://app.example/portal/?old=1#old','a b&c');
ok(url==='https://app.example/portal/#reset_token=a%20b%26c','reset link preserves trusted app path while moving encoded token to fragment');
const parsed=new URL(url);
ok(parsed.search===''&&parsed.hash==='#reset_token=a%20b%26c','reset secret is absent from HTTP request query and present only in fragment');
ok(!parsed.toString().includes('?reset_token='),'reset token is not query-addressable');
console.log(`V78 1.21.91 password reset fragment runtime: ${pass}/${pass} PASS`);
