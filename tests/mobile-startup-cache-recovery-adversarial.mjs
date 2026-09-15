import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const headers=fs.readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const recover=fs.readFileSync(new URL('../public/recover.html',import.meta.url),'utf8');
const recoverRuntime=fs.readFileSync(new URL('../public/js/recover-runtime.js',import.meta.url),'utf8');
const domSecurity=fs.readFileSync(new URL('../public/js/dom-security.js',import.meta.url),'utf8');
const events=fs.readFileSync(new URL('../public/js/event-delegation.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

// Legacy PWA workers must converge to a no-interception, no-navigation state.
assert.match(sw,/LEGACY_CACHE_PREFIX="thebe-desk-"/,'service worker must scope cleanup to Thebe Desk caches');
assert.match(sw,/self\.registration\.unregister\(\)/,'service worker must unregister itself after activation');
assert.doesNotMatch(sw,/addEventListener\("fetch"/,'decommission worker must not intercept production requests');
assert.doesNotMatch(sw,/clients\.openWindow|window\.open|location\.(?:reload|assign|replace)/,'service worker must never open, reload, or navigate browser windows');
assert.match(sw,/skipWaiting\(\)/,'stale workers should advance immediately to the decommission revision');

assert.match(headers,/\/sw\.js\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'service worker must not be HTTP cached');
assert.match(headers,/\/recover\.html\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'recovery page must not be cached');
assert.match(headers,/\/js\/recover-runtime\.js\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'recovery runtime must not be cached');

assert.match(recover,/recover-runtime\.js/,'recovery page must load recovery runtime');
assert.match(recoverRuntime,/getRegistrations\(\)/,'recovery runtime must unregister stale service workers');
assert.match(recoverRuntime,/caches\.keys\(\)/,'recovery runtime must enumerate caches');
assert.match(recoverRuntime,/caches\.delete\(key\)/,'recovery runtime must clear stale caches');
assert.match(recoverRuntime,/location\.replace/,'manual recovery runtime may reopen the live root once after explicit recovery');

// Normal production startup must clean old Chrome/PWA state without any reload,
// popup, or navigation side effect. It runs once immediately and again after
// DOMContentLoaded so the historical inline register() call cannot persist.
assert.match(domSecurity,/installLegacyBrowserRuntimeDecommission/,'normal startup must install legacy browser-runtime cleanup');
assert.match(domSecurity,/getRegistrations\(\)/,'normal startup must enumerate stale service-worker registrations');
assert.match(domSecurity,/registration=>registration\.unregister\(\)/,'normal startup must unregister stale service workers');
assert.match(domSecurity,/startsWith\("thebe-desk-"\)/,'normal startup cache cleanup must be limited to Thebe Desk caches');
assert.match(domSecurity,/DOMContentLoaded/,'cleanup must repeat after document startup to catch a legacy inline registration');
assert.doesNotMatch(domSecurity,/window\.open|clients\.openWindow|location\.(?:reload|assign|replace)/,'normal startup cleanup must never create tabs or navigate/reload');
const domSecurityPosition=index.indexOf('js/dom-security.js');
const legacyRegisterPosition=index.indexOf('navigator.serviceWorker.register');
assert.ok(domSecurityPosition>=0&&legacyRegisterPosition>domSecurityPosition,'browser-runtime decommission must load before the historical service-worker registration call');

assert.match(index,/<meta name="bw-runtime-mode" content="production"\s*\/>/,'production root must remain explicitly production mode');
assert.match(index,/\.previewmode\{display:none/,'preview marker must be hidden by default');
assert.doesNotMatch(index,/<body[^>]*class="[^"]*standalone-preview/,'production body must not start in standalone preview mode');

assert.match(events,/bw-mobile-runtime-hardening/,'mobile runtime must install an explicit hardening boundary');
assert.match(events,/touch-action:pan-y!important/,'mobile workspace drawer must retain vertical touch scrolling');
assert.match(events,/body\.mobile-nav-open\{overflow:hidden!important;touch-action:auto!important\}/,'open mobile drawer must not disable all body touch handling');
assert.match(events,/backdrop-filter:none!important/,'mobile backdrop must avoid expensive blur during drawer interaction');
assert.match(events,/el\.style\.setProperty\("display","none","important"\)/,'production runtime must force-hide the standalone preview marker');
assert.match(events,/doc\.body\?\.classList\.remove\("standalone-preview"\)/,'production runtime must remove stale standalone-preview state');

console.log('PASS mobile + desktop Chrome startup/cache recovery adversarial gate');
