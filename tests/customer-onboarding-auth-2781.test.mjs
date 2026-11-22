import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/js/auth-portal.js",import.meta.url),"utf8");
const start=source.indexOf("function safeNext(){");
const end=source.indexOf("\nconst next=safeNext();",start);
assert.ok(start>=0&&end>start,"safeNext implementation must exist");
const functionSource=source.slice(start,end);

function destination(next){
  const params=new URLSearchParams();
  if(next!==undefined)params.set("next",next);
  const context={params,location:{origin:"https://thebedesk.com"},URL};
  return vm.runInNewContext(functionSource+";safeNext()",context);
}

test("onboarding return URL defaults to the workspace",()=>{
  assert.equal(destination(),"/app/");
  assert.equal(destination("https://evil.example/"),"/app/");
  assert.equal(destination("//evil.example/"),"/app/");
});
test("onboarding return URL rejects backslash and control characters",()=>{
  for(const input of ["/\\evil.example","/app/\nLocation:evil","/app/\u007f","/app/\u0000"]){
    assert.equal(destination(input),"/app/");
  }
});
test("onboarding return URL preserves legitimate local paths",()=>{
  assert.equal(destination("/app/?tab=finance#overview"),"/app/?tab=finance#overview");
  assert.equal(destination("/app/"),"/app/");
});
test("authentication status is announced without injecting HTML",()=>{
  assert.match(source,/status\.setAttribute\("aria-live","polite"\)/);
  assert.match(source,/status\.setAttribute\("aria-atomic","true"\)/);
  assert.match(source,/status\.textContent=String\(message\|\|""\)/);
});


test("invalid onboarding inputs receive keyboard focus and helpful mode-specific guidance",()=>{
  assert.match(source,/setStatus\("Enter a valid email address\."\);email\.focus\(\)/);
  assert.match(source,/password\.focus\(\);return/);
  assert.match(source,/company\.focus\(\);throw new Error/);
  assert.match(source,/mode==="register"\?"Create a password/);
});
