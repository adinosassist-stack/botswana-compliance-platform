import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../public/js/api-client.js",import.meta.url),"utf8");
test("network failure diagnostics include safe route and request correlation, never full query URL",()=>{
  const start=source.indexOf('console.error("BW API request failed"');
  assert.ok(start>=0);
  const end=source.indexOf("onError(err,",start);
  const diagnostic=source.slice(start,end);
  assert.match(diagnostic,/path:new URL\(logicalTarget\)\.pathname/);
  assert.match(diagnostic,/requestId/);
  assert.match(diagnostic,/transport:preferredTransport/);
  assert.match(diagnostic,/timeoutMs:requestTimeoutMs/);
  assert.doesNotMatch(diagnostic,/url:logicalTarget/);
});
