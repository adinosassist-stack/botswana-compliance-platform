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


test("existing users can sign in with legacy passwords while new registrations require twelve characters",()=>{
  assert.match(source,/mode==="register"&&secret\.length<12/);
  assert.match(source,/mode==="login"&&!secret/);
  assert.doesNotMatch(source,/if\(secret\.length<12\)/);
});
test("business name validation precedes registration proof and network submission",()=>{
  const validation=source.indexOf('if(mode==="register"&&String(company.value||"").trim().length<2)');
  const busy=source.indexOf("busy=true;submit.disabled=true",validation);
  assert.ok(validation>=0&&busy>validation);
  assert.match(source,/setStatus\("Enter a business name with at least 2 characters\."\);company\.focus\(\);return/);
});


test("workspace selection excludes missing tenant IDs and focuses valid choices",()=>{
  assert.match(source,/if\(!tenantId\)continue/);
  assert.match(source,/if\(!workspace\.options\.length\)/);
  assert.match(source,/workspaceField\.hidden=false;setStatus\("Choose the workspace you want to open\.","good"\);workspace\.focus\(\)/);
});


test("registration announces ordered progress through accessible status",()=>{
  const steps=["Step 1 of 3: Checking registration security","Step 2 of 3: Creating your workspace","Step 3 of 3: Opening your workspace"];
  let previous=-1;
  for(const step of steps){const position=source.indexOf(step);assert.ok(position>previous,step);previous=position}
  assert.match(source,/status\.setAttribute\("aria-live","polite"\)/);
});


test("authentication form reports busy state and always clears it",()=>{
  assert.match(source,/busy=true;submit\.disabled=true;form\.setAttribute\("aria-busy","true"\)/);
  assert.match(source,/finally\{busy=false;submit\.disabled=false;form\.removeAttribute\("aria-busy"\)/);
});

const directRegistrationSource=fs.readFileSync(new URL("../public/js/register-direct.js",import.meta.url),"utf8");
test("direct registration announces status and focuses invalid fields",()=>{
  assert.match(directRegistrationSource,/status\.setAttribute\("aria-live","polite"\)/);
  for(const id of ["companyName","email","password"]){
    assert.ok(directRegistrationSource.includes('document.getElementById("'+id+'")?.focus()'),id+" focus missing");
  }
});
test("direct registration sets and clears busy state",()=>{
  assert.match(directRegistrationSource,/form\.setAttribute\("aria-busy","true"\)/);
  assert.match(directRegistrationSource,/form\.removeAttribute\("aria-busy"\)/);
});


const directRegistration = fs.readFileSync(new URL("../public/js/register-direct.js", import.meta.url), "utf8");

test("direct registration ignores repeat submits and clears busy state after a failure", async () => {
  const attributes = new Map();
  let submit;
  let rejectChallenge;
  let requests = 0;
  const form = {
    addEventListener: (_, handler) => { submit = handler; },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  };
  const button = { disabled: false };
  const status = { setAttribute() {} };
  const elements = {
    registerForm: form, submitBtn: button, status,
    companyName: { value: "Demo Business" },
    email: { value: "owner@example.test" },
    password: { value: "temporary-test-password" },
  };
  vm.runInNewContext(directRegistration, {
    TextEncoder,
    document: { getElementById: id => elements[id] },
    window: { BW: { api: { createClient: () => ({
      request(path) {
        assert.equal(path, "/api/auth/registration-proof/challenge");
        requests++;
        return new Promise((_, reject) => { rejectChallenge = reject; });
      },
    }) } } },
  });

  const event = { preventDefault() {} };
  const first = submit(event);
  const rejectFirst = rejectChallenge;
  assert.equal(attributes.get("aria-busy"), "true");
  const duplicate = submit(event);
  rejectFirst(new Error("Connection lost"));
  if (requests > 1) rejectChallenge(new Error("Unexpected duplicate request"));
  await Promise.all([first, duplicate]);
  assert.equal(requests, 1);
  assert.equal(button.disabled, false);
  assert.equal(attributes.has("aria-busy"), false);
  assert.match(status.textContent, /Connection lost/);

  const retry = submit(event);
  assert.equal(requests, 2);
  rejectChallenge(new Error("Connection lost again"));
  await retry;
  assert.equal(attributes.has("aria-busy"), false);
});
