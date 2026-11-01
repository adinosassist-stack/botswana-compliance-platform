import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const js=readFileSync(new URL("../public/js/thebe-assets-native-panel.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/assets/thebe-assets-native-panel.css",import.meta.url),"utf8");
test("feature stays hidden without authenticated tenant-scoped server capability",()=>{
 assert.match(js,/capability\?\.enabled!==true/);
 assert.match(js,/capability\?\.authenticated!==true/);
 assert.match(js,/capability\?\.tenantAuthorized!==true/);
});
test("panel uses no untrusted HTML or duplicate native shell",()=>{
 assert.doesNotMatch(js,/(?:innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.write)\s*[=(]/);
 assert.doesNotMatch(js,/create\("aside"|create\("iframe"|thebe-ai-dock/);
 assert.match(js,/textContent/);
 assert.match(js,/Asset data unavailable/);
});
test("styles are scoped and use established Workspace colors",()=>{
 assert.match(css,/\.thebe-assets-native/);
 assert.match(css,/#e3e6e8/);
 assert.match(css,/#0b66d6/);
 assert.doesNotMatch(css,/(?:^|\n)\s*(?:body|main|aside|:root)\s*\{/);
});
