import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('Android CI validates oldest supported API and current Android emulator separately',()=>{
  const y=read('.github/workflows/thebe-ai-android-check.yml');
  const gradle=read('android/thebe-ai/app/build.gradle.kts');
  assert.match(gradle,/minSdk\s*=\s*26\b/);
  assert.match(y,/fail-fast:\s*false/);
  assert.match(y,/api_level:\s*26\b/);
  assert.match(y,/api_level:\s*35\b/);
  assert.match(y,/api-level:\s*\$\{\{\s*matrix\.api_level\s*\}\}/);
  assert.match(y,/profile:\s*\$\{\{\s*matrix\.profile\s*\}\}/);
  assert.match(y,/needs:\s*android-debug/);
  assert.match(y,/scripts\/smoke-emulator\.sh/);
});

test('tablet inspection is read-only and does not install or start apps',()=>{
  const s=read('android/thebe-ai/scripts/inspect-tablet.sh');
  assert.match(s,/adb.*getprop/);
  assert.match(s,/resolve-activity/);
  assert.doesNotMatch(s,/adb\s+(?:-s\s+[^\s]+\s+)?(?:install|uninstall|reboot|push|pull|root|remount)\b/);
  assert.doesNotMatch(s,/am\s+(?:start|force-stop)|logcat\s+-c|screencap|uiautomator/);
});
