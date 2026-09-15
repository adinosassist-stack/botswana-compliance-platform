import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const headers=fs.readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const recover=fs.readFileSync(new URL('../public/recover.html',import.meta.url),'utf8');
const recoverRuntime=fs.readFileSync(new URL('../public/js/recover-runtime.js',import.meta.url),'utf8');
const events=fs.readFileSync(new URL('../public/js/event-delegation.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

assert.match(sw,/mobile-startup-recovery-20260915/,'service worker cache generation must be advanced');
assert.match(sw,/request\.mode===\"navigate\"/,'navigation handling must be explicit');
assert.doesNotMatch(sw,/fallbackKey:\s*\"\.\/\"/,'navigation must never fall back to cached root HTML');
assert.match(sw,/No preview or cached workspace has been loaded/,'offline navigation must fail visibly instead of serving stale preview HTML');
assert.match(sw,/navigationPreload\.enable/,'navigation preload should reduce service-worker startup latency');

assert.match(headers,/\/sw\.js\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'service worker must not be HTTP cached');
assert.match(headers,/\/recover\.html\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'recovery page must not be cached');
assert.match(headers,/\/js\/recover-runtime\.js\s+[\s\S]*?Cache-Control:\s*no-store, max-age=0, must-revalidate/,'recovery runtime must not be cached');

assert.match(recover,/recover-runtime\.js/,'recovery page must load recovery runtime');
assert.match(recoverRuntime,/getRegistrations\(\)/,'recovery runtime must unregister stale service workers');
assert.match(recoverRuntime,/caches\.keys\(\)/,'recovery runtime must enumerate caches');
assert.match(recoverRuntime,/caches\.delete\(key\)/,'recovery runtime must clear stale caches');
assert.match(recoverRuntime,/location\.replace/,'recovery runtime must reopen the live root after cleanup');

assert.match(index,/<meta name="bw-runtime-mode" content="production"\s*\/>/,'production root must remain explicitly production mode');
assert.match(index,/\.previewmode\{display:none/,'preview marker must be hidden by default');
assert.doesNotMatch(index,/<body[^>]*class="[^"]*standalone-preview/,'production body must not start in standalone preview mode');

assert.match(events,/bw-mobile-runtime-hardening/,'mobile runtime must install an explicit hardening boundary');
assert.match(events,/touch-action:pan-y!important/,'mobile workspace drawer must retain vertical touch scrolling');
assert.match(events,/body\.mobile-nav-open\{overflow:hidden!important;touch-action:auto!important\}/,'open mobile drawer must not disable all body touch handling');
assert.match(events,/backdrop-filter:none!important/,'mobile backdrop must avoid expensive blur during drawer interaction');
assert.match(events,/el\.style\.setProperty\("display","none","important"\)/,'production runtime must force-hide the standalone preview marker');
assert.match(events,/doc\.body\?\.classList\.remove\("standalone-preview"\)/,'production runtime must remove stale standalone-preview state');

console.log('PASS mobile startup/cache/menu recovery adversarial gate');
