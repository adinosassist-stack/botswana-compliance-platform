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

test("owner with insufficient quotation history can open Sales Intelligence by keyboard", () => {
  const script = fs.readFileSync(new URL("../public/js/executive-personalization.js", import.meta.url), "utf8");
  const extract = (start, end) => script.slice(script.indexOf(start), script.indexOf(end));
  const context = vm.createContext({
    document: {},
    global: { matchMedia: () => ({ matches: true }) },
    centre: {},
    isOwner: () => true,
    signalByLabel: (_, label) => label === "Sales conversion" ? "Record enough resolved quotations" : "",
    cardText: card => card,
  });
  const events = [];
  const details = { open: false, scrollIntoView: options => events.push(options.behavior) };
  const summary = { focus: () => events.push("focus") };
  context.q = (selector, root) => {
    if (selector === "#ownerSalesWorkspace" && root === context.centre) return details;
    if (selector === "summary" && root === details) return summary;
    return null;
  };
  vm.runInContext(extract("function openDetails(", "  function ensurePriorityShell(") +
    extract("function nextOnboardingStep(", "  function renderOnboarding("), context);
  assert.equal(vm.runInContext("nextOnboardingStep(centre).label", context), "Open Sales Intelligence");
  vm.runInContext("nextOnboardingStep(centre).action()", context);
  assert.equal(details.open, true);
  assert.deepEqual(events, ["focus", "instant"]);
  context.q = () => null;
  assert.equal(vm.runInContext("nextOnboardingStep(centre)", context), null);
});


test("successful registration retries authentication rather than recreating a workspace",async()=>{
 const start=source.indexOf("async function registerAccount(");
 const end=source.indexOf("\nasync function loadCapabilities()",start);
 assert.ok(start>=0&&end>start,"registration flow available");
 let creations=0,logins=0;
 const events=[];
 const context={
  registrationMode:"open",
  LEGAL_VERSION:"2026-10-14",
  setStatus:message=>events.push("status:"+message),
  setMode:mode=>events.push("mode:"+mode),
  solveRegistrationProof:async()=>"synthetic-proof",
  api:async(path)=>{
   assert.equal(path,"/api/auth/register");
   creations++;
   return {ok:true};
  },
  login:async()=>{
   logins++;
   throw new Error("Temporary network issue");
  },
  requestRecovery:async()=>false
 };
 const register=vm.runInNewContext(source.slice(start,end)+"\nregisterAccount",context);
 await assert.rejects(register({email:"owner@example.test",password:"synthetic-only"}),/workspace was created.*Sign in to retry/);
 assert.equal(creations,1);
 assert.equal(logins,1);
 assert.deepEqual(events.filter(e=>e.startsWith("mode:")),["mode:login"]);
 const before=events.indexOf("mode:login");
 const after=events.findIndex(e=>e.includes("Step 3 of 3"));
 assert.ok(before>=0&&after>before,"mode changes before automated sign-in");
});

test("registration API failure does not claim the account exists",async()=>{
 const start=source.indexOf("async function registerAccount(");
 const end=source.indexOf("\nasync function loadCapabilities()",start);
 const modes=[];
 const context={
  registrationMode:"open",
  LEGAL_VERSION:"2026-10-14",
  setStatus:()=>{},
  setMode:mode=>modes.push(mode),
  solveRegistrationProof:async()=>"synthetic-proof",
  api:async()=>{throw new Error("Registration request failed")}
 };
 const register=vm.runInNewContext(source.slice(start,end)+"\nregisterAccount",context);
 await assert.rejects(register({email:"owner@example.test"}),/Registration request failed/);
 assert.deepEqual(modes,[]);
});

test("new owner can choose an authorized workspace after registration",async()=>{
 const start=source.indexOf("async function registerAccount(");
 const end=source.indexOf("\nasync function loadCapabilities()",start);
 const calls=[];
 const context={
  registrationMode:"open",
  LEGAL_VERSION:"2026-10-14",
  setStatus:()=>{},
  setMode:mode=>calls.push("mode:"+mode),
  solveRegistrationProof:async()=>"synthetic-proof",
  api:async(path)=>{calls.push(path);return {ok:true}},
  login:async(payload)=>{
   calls.push("login:"+String(payload.tenantId||"default"));
   if(!payload.tenantId){
    const error=new Error("Select workspace");
    error.code="workspace_selection_required";
    error.data={workspaces:[{role:"manager",tenantId:"tenant-manager"},{role:"owner",tenantId:"tenant-owner"}]};
    throw error;
   }
   assert.equal(payload.tenantId,"tenant-owner");
  }
 };
 const register=vm.runInNewContext(source.slice(start,end)+"\nregisterAccount",context);
 await register({email:"owner@example.test",password:"synthetic-only"});
 assert.deepEqual(calls,["/api/auth/register","mode:login","login:default","login:tenant-owner"]);
});
