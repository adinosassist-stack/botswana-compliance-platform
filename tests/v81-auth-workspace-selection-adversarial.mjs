import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('password login verifies credentials before disclosing workspace memberships',()=>{
  const loginStart=worker.indexOf('if(url.pathname==="/api/auth/login"&&req.method==="POST")');
  assert.ok(loginStart>=0);
  const block=worker.slice(loginStart,loginStart+6500);
  const verify=block.indexOf('verifyPassword(password');
  const memberships=block.indexOf('FROM memberships m JOIN tenants');
  assert.ok(verify>=0 && memberships>verify,'membership choices must be loaded only after password verification');
  assert.match(block,/workspace_selection_required/);
  assert.match(block,/workspaces:choices\.map/);
  assert.match(block,/requestedTenantId/);
  assert.match(block,/workspace_not_available/);
});

test('session creation is pinned to the selected active tenant and exact role',()=>{
  const start=worker.indexOf('async function createPasswordSession');
  const block=worker.slice(start,start+2400);
  assert.match(block,/EXISTS\(SELECT 1 FROM memberships WHERE user_id=\? AND tenant_id=\? AND status='active' AND role=\?\)/);
  assert.match(block,/expectedPasswordHash/);
  assert.match(block,/expectedGeneration/);
});

test('frontend exposes explicit workspace choice and sends selected tenant',()=>{
  assert.match(html,/id="workspaceChoiceField"/);
  assert.match(html,/id="authWorkspace"/);
  assert.match(html,/function showWorkspaceChoices\(items\)/);
  assert.match(html,/payload\.tenantId=selectedWorkspace/);
  assert.match(html,/workspace_selection_required/);
});

test('registration retains JIT Turnstile and attempts first sign-in automatically',()=>{
  assert.match(html,/freshRegistrationTurnstileToken/);
  assert.match(html,/payload\.turnstileToken=await freshRegistrationTurnstileToken\(\)/);
  assert.match(html,/runtimeApiClient\.request\("\/api\/auth\/login"/);
  assert.match(html,/const runtimeApiClient=STANDALONE_PREVIEW\?.*BW\.preview\.request.*:productionApiClient/);
  assert.match(html,/authPassword\.value=payload\.password/);
  assert.doesNotMatch(html,/Complete the human verification before creating the account/);
});
