import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=readFileSync(new URL('../docs/conversation-api-security-contract.md',import.meta.url),'utf8');
const required=['POST /api/conversations','GET /api/conversations?cursor=&limit=','GET /api/conversations/:id/messages?cursor=&limit=','POST /api/conversations/:id/messages','DELETE /api/conversations/:id','idempotency','CSRF','Tenant A','raw audio','retention'];
for(const r of required)assert(doc.includes(r),`missing API security contract: ${r}`);
assert(doc.includes('not currently implemented'),'contract must not falsely claim runtime deployment');
console.log('Conversation API security design contract guard PASS');
