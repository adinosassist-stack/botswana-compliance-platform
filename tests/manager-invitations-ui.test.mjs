import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/js/manager-invitations-owner.js',import.meta.url),'utf8');
test('unmounted invitation view delegates authorization to server and escapes email as DOM property',()=>{
  assert.match(source,/ownerConfirmed!==true/);
  assert.match(source,/request\(\{email:address,branch:select.value\}\)/);
  assert.match(source,/status\.textContent/);
  assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage/);
  assert.doesNotMatch(source,/fetch\(/);
});


test('manager suspension requires a second deliberate click and offers cancellation without browser dialogs',()=>{
 const ownerEntry=fs.readFileSync(new URL('../public/js/manager-invite-owner-entry.js',import.meta.url),'utf8');
 assert.match(ownerEntry,/button\('Confirm suspension'/);
 assert.match(ownerEntry,/button\('Cancel suspension'/);
 assert.match(ownerEntry,/suspendButton\.hidden=true/);
 assert.match(ownerEntry,/suspendButton\.hidden=false/);
 assert.doesNotMatch(ownerEntry,/\b(?:alert|confirm|prompt)\s*\(/);
});
