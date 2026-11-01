import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../scripts/general-ai-private-staging-verify.mjs",import.meta.url),"utf8");
test("private staging verifier is read-only and scoped",()=>{
 assert.match(source,/bw-general-ai-staging/);
 assert.match(source,/method|fetch\(base/);
 assert.doesNotMatch(source,/\b(?:POST|PUT|PATCH|DELETE)\b/);
 assert.match(source,/subdomain\?\.enabled===false/);
 assert.match(source,/previews_enabled===false/);
 assert.match(source,/forbidden\.length===0/);
 assert.doesNotMatch(source,/console\.log\([^\n]*(?:token|Authorization)/);
});
