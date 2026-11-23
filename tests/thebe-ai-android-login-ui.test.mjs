import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessLoginHierarchy} from '../android/thebe-ai/scripts/check-login-ui.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const hierarchy=(...labels)=>`<?xml version="1.0"?><hierarchy rotation="0">${labels.map((text,i)=>`<node index="${i}" text="${text}" content-desc="" />`).join('')}</hierarchy>`;

test('distinctive branded login content is required',()=>{
  assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Open your Thebe Desk workspace.')).status,'pass');
  assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Business name','Sign in')).status,'pass');
  assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Forgot password?')).status,'pass');
  assert.equal(assessLoginHierarchy(hierarchy('thebedesk.com','Sign in')).status,'blocked');
  assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Sign in')).status,'blocked');
  assert.equal(assessLoginHierarchy(hierarchy('Business name','Sign in')).status,'blocked');
});

test('browser error and chooser are never accepted even with login text',()=>{
  for(const label of ['Web page not available','This site can\'t be reached','ERR_NAME_NOT_RESOLVED','No internet connection','Choose an app']){
    assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Business name',label)).status,'blocked');
  }
});

test('browser onboarding, chooser and network failures have safe classified blockers',()=>{
  const examples=[
    ['Welcome to Chrome','browser first-run/onboarding prompt visible'],
    ['Use without an account','browser first-run/onboarding prompt visible'],
    ['Open with','Android browser chooser visible'],
    ['Just once','Android browser chooser visible'],
    ['Web page not available','browser network or rendering error visible']
  ];
  for(const [label,expected] of examples){
    const result=assessLoginHierarchy(hierarchy('Thebe Desk','Business name',label));
    assert.equal(result.status,'blocked');
    assert.equal(result.reason,expected);
  }
});

test('empty, malformed, oversize and unrelated emulator output fail closed',()=>{
  assert.equal(assessLoginHierarchy('').status,'blocked');
  assert.equal(assessLoginHierarchy('<node text="Thebe Desk" />').status,'blocked');
  assert.equal(assessLoginHierarchy(hierarchy('Chrome','Search')).status,'blocked');
  assert.equal(assessLoginHierarchy('x'.repeat(1024*1024+1)).status,'blocked');
  assert.equal(assessLoginHierarchy(hierarchy('Thebe Desk','Open your Thebe Desk workspace.','No browser found')).status,'blocked');
});

test('emulator check is isolated and never uploads/login to user account',()=>{
  const s=read('android/thebe-ai/scripts/assert-login-screen-emulator.sh');
  const cli=read('android/thebe-ai/scripts/check-login-ui.mjs');
  assert.match(s,/uiautomator dump/);
  assert.match(s,/check-login-ui\.mjs/);
  assert.doesNotMatch(s,/adb install|am start|curl|wget|upload-artifact|api\/auth|input tap|input text/);
  assert.doesNotMatch(cli,/fetch\(|api\/auth|password\s*=|upload/gi);
});
