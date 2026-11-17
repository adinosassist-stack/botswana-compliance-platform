import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('manager onboarding pages only served through explicit staging gate',()=>{
 const w=read('cloudflare/src/worker.js');
 const i=w.indexOf("if(url.pathname.startsWith('/manager-invite/'))");
 assert.ok(i>=0);
 const block=w.slice(i,i+1600);
 assert.match(block,/APP_ENV/);assert.match(block,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
 assert.match(block,/return json\(\{error:'not_found'\},404\)/);
 assert.match(block,/manager-invite\/owner/);assert.match(block,/manager-invite\/activate/);
});
test('owner invitation page uses authenticated session and CSRF and fragment-only link',()=>{
 const s=read('public/js/manager-invite-owner-entry.js');
 assert.match(s,/api\/auth\/me/);assert.match(s,/session\?\.user\?\.role!=='owner'/);
 assert.match(s,/x-csrf-token/);assert.match(s,/#token=/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|location\.search/);
});
test('activation page strips fragment before posting token',()=>{
 const s=read('public/js/manager-invite-activate.js');
 assert.match(s,/location\.hash/);assert.match(s,/history\.replaceState/);
 assert.match(s,/manager-invite\/accept/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|location\.search/);
});
