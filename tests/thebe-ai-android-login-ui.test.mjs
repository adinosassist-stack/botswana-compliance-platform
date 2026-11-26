import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessLoginHierarchy,summarizeHierarchy} from '../android/thebe-ai/scripts/check-login-ui.mjs';

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

test('emulator diagnostics expose only aggregate signals, never UI text',()=>{
  const xml='<?xml version="1.0"?><hierarchy>'+
    '<node package="com.android.chrome" class="android.webkit.WebView" text="private@example.com" content-desc="" />'+
    '<node package="com.android.chrome" class="android.widget.TextView" text="Welcome to Chrome" content-desc="" />'+
    '</hierarchy>';
  const summary=summarizeHierarchy(xml);
  assert.deepEqual(summary,{nodes:2,labelledNodes:2,chromeOwned:true,webView:true,systemUiOwned:false,launcherOwned:false,permissionOwned:false,androidSettingsOwned:false,targetAppOwned:false});
  assert.doesNotMatch(JSON.stringify(summary),/private@example\.com|Welcome to Chrome/);
  assert.deepEqual(summarizeHierarchy(null),{nodes:0,labelledNodes:0,chromeOwned:false,webView:false,systemUiOwned:false,launcherOwned:false,permissionOwned:false,androidSettingsOwned:false,targetAppOwned:false});
});

test('first-run Chrome setup is restricted to disposable Android 15 emulators',()=>{
  const setup=read('android/thebe-ai/scripts/prepare-chrome-emulator.sh');
  const smoke=read('android/thebe-ai/scripts/smoke-emulator.sh');
  assert.ok(setup.includes('THEBE_ANDROID_SYNTHETIC_EMULATOR'));
  assert.ok(setup.includes('adb get-serialno'));
  assert.ok(setup.includes('ro.kernel.qemu'));
  assert.ok(setup.includes('ro.build.version.sdk'));
  assert.ok(setup.includes('emulator-*'));
  assert.ok(setup.includes('--disable-fre'));
  assert.ok(setup.includes('--no-first-run'));
  assert.ok(setup.includes('com.android.chrome'));
  assert.ok(smoke.includes('THEBE_ANDROID_SYNTHETIC_EMULATOR=1 bash android/thebe-ai/scripts/prepare-chrome-emulator.sh'));
  assert.ok(smoke.includes('if [[ "$android_api" == "35" ]]'));
  assert.ok(!setup.includes('disable-digital-asset-link-verification-for-url'));
  assert.ok(!setup.includes('disable-web-security'));
  assert.ok(!setup.includes('ignore-certificate-errors'));
});

test('failed emulator UI check prints redacted foreground categories only',()=>{
  const s=read('android/thebe-ai/scripts/assert-login-screen-emulator.sh');
  assert.ok(s.includes('SAFE_EMULATOR_FOREGROUND'));
  assert.ok(s.includes('adb shell pidof com.android.chrome'));
  assert.ok(s.includes('topResumedActivity'));
  assert.ok(s.includes("foreground_class='chrome'"));
  assert.ok(s.includes("foreground_class='unknown'"));
  assert.ok(!s.includes('printf "%s" "$foreground"'));
  assert.ok(!s.includes('cat "$xml"'));
});

test('emulator check is isolated and never uploads/login to user account',()=>{
  const s=read('android/thebe-ai/scripts/assert-login-screen-emulator.sh');
  const cli=read('android/thebe-ai/scripts/check-login-ui.mjs');
  assert.match(s,/uiautomator dump/);
  assert.match(s,/check-login-ui\.mjs/);
  assert.doesNotMatch(s,/adb install|am start|curl|wget|upload-artifact|api\/auth|input tap|input text/);
  assert.doesNotMatch(cli,/fetch\(|api\/auth|password\s*=|upload/gi);
});

test('API35 failure diagnostics classify only allowlisted platform ownership booleans',()=>{
  const synthetic='<?xml version="1.0"?><hierarchy>'+
    '<node package="com.android.systemui" text="private@example.com" content-desc="secret" />'+
    '<node package="com.google.android.apps.nexuslauncher" text="TOP SECRET" content-desc="" />'+
    '<node package="com.android.permissioncontroller" text="deny this?" content-desc="" />'+
    '<node package="com.android.settings" text="location" content-desc="" />'+
    '<node package="com.thebedesk.ai" text="some app" content-desc="" />'+
    '</hierarchy>';
  const safe=summarizeHierarchy(synthetic);
  assert.deepEqual(safe,{
    nodes:5,labelledNodes:5,chromeOwned:false,webView:false,
    systemUiOwned:true,launcherOwned:true,permissionOwned:true,
    androidSettingsOwned:true,targetAppOwned:true
  });
  assert.doesNotMatch(JSON.stringify(safe),/private@example|TOP SECRET|deny this|location|com\.android\.systemui/);
  assert.equal(assessLoginHierarchy(synthetic).status,'blocked',
    'platform classification must NEVER bypass branded sign-in requirements');
});

test('Android 35 sign-in retry remains bounded and fail-closed without leak-prone output',()=>{
  const shell=read('android/thebe-ai/scripts/assert-login-screen-emulator.sh');
  const cli=read('android/thebe-ai/scripts/check-login-ui.mjs');
  assert.match(shell,/for attempt in 1 2 3 4 5 6; do/);
  assert.match(shell,/if \[\[ "\$attempt" -ne 6 \]\]; then sleep 5; fi/);
  assert.match(shell,/exit 1/);
  assert.match(shell,/check-login-ui\.mjs/);
  assert.doesNotMatch(shell,/cat "\$xml"|printf.*"\$foreground"|curl|wget|--ignore-certificate-errors/);
  assert.match(cli,/SAFE_EMULATOR_UI_DIAG/);
  assert.match(cli,/systemUiOwned/);
  assert.match(cli,/launcherOwned/);
  assert.doesNotMatch(cli,/process\.stderr\.write\(xml|console\.log\(xml/);
});
