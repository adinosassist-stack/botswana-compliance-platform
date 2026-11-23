import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../android/thebe-ai');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

test('Android app launches the canonical HTTPS workspace in an isolated browser TWA',()=>{
  const manifest=read('app/src/main/AndroidManifest.xml');
  assert.match(manifest,/android:name="com\.google\.androidbrowserhelper\.trusted\.LauncherActivity"/);
  assert.match(manifest,/android:value="https:\/\/thebedesk\.com\/app\/"/);
  assert.match(manifest,/android:exported="true"/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.doesNotMatch(manifest,/android\.permission\.(?:RECORD_AUDIO|CAMERA|READ_CONTACTS|READ_SMS|QUERY_ALL_PACKAGES)/);
  assert.doesNotMatch(manifest,/<(?:WebView|service\s+android:name=".*(?:Billing|Payment))\b/);
  assert.doesNotMatch(manifest,/android\.intent\.action\.VIEW/); // no app-link hijack before verified origin
});

test('app-to-site association is declared but site-side signing proof is not guessed',()=>{
  const strings=read('app/src/main/res/values/strings.xml');
  assert.match(strings,/https:\/\/thebedesk\.com/);
  assert.match(strings,/delegate_permission\/common\.handle_all_urls/);
  assert.doesNotMatch(strings,/(?:sha256_cert_fingerprints|FAKE_FINGERPRINT|PLACEHOLDER)/);
  assert.match(read('README.md'),/real verified release-signing SHA-256 fingerprint/);
});

test('source-only build uses an isolated app ID and does not enable native account or payment access',()=>{
  const build=read('app/build.gradle.kts');
  assert.match(build,/applicationId\s*=\s*"com\.thebedesk\.ai"/);
  assert.match(build,/minSdk\s*=\s*26/);
  assert.match(build,/implementation\("com\.google\.androidbrowserhelper:androidbrowserhelper:2\.7\.4"\)/);
  assert.doesNotMatch(build,/signingConfig|apiKey|clientSecret|payment/gi);
});
