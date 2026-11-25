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
    registerForm: form, submitBtn: button, status, directLegalAccept:{checked:true},
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


test("unconfirmed registration result sends owner to sign in without another registration POST",async()=>{
 const sectionStart=source.indexOf("async function registerAccount(");
 const sectionEnd=source.indexOf("\nasync function loadCapabilities()",sectionStart);
 assert.ok(sectionStart>=0&&sectionEnd>sectionStart);
 const codes=["registration_confirmation_unavailable","registration_not_confirmed","timeout","network_error","auth_transport_changed","auth_transport_unavailable"];
 for(const code of codes){
  const modes=[],calls=[];
  const ctx={
   registrationMode:"open",LEGAL_VERSION:"2026-10-14",
   solveRegistrationProof:async()=>"synthetic-proof",
   setMode:mode=>modes.push(mode),
   setStatus:()=>{},
   api:async path=>{calls.push(path);throw Object.assign(new Error("Uncertain response"),{code})}
  };
  const register=vm.runInNewContext(source.slice(sectionStart,sectionEnd)+"\nregisterAccount",ctx);
  await assert.rejects(register({email:"owner@example.test",password:"test-only-credentials"}),/couldn't confirm whether your workspace was created.*Sign in first/);
  assert.deepEqual(modes,["login"],code);
  assert.deepEqual(calls,["/api/auth/register"],code);
 }
});

test("explicit registration validation failure remains correctable",async()=>{
 const start=source.indexOf("async function registerAccount(");
 const end=source.indexOf("\nasync function loadCapabilities()",start);
 const modes=[];
 const context={
  registrationMode:"open",LEGAL_VERSION:"2026-10-14",
  solveRegistrationProof:async()=>"synthetic-proof",
  setMode:mode=>modes.push(mode),setStatus:()=>{},
  api:async()=>{throw Object.assign(new Error("Correct your company name"),{code:"invalid_registration"})}
 };
 const register=vm.runInNewContext(source.slice(start,end)+"\nregisterAccount",context);
 await assert.rejects(register({email:"owner@example.test"}),/Correct your company name/);
 assert.deepEqual(modes,[]);
});

test("direct signup with uncertain response cannot submit a second account creation request",async()=>{
 const attrs=new Map(),paths=[];
 let submit,registrations=0;
 const form={addEventListener:(_event,handler)=>{submit=handler},
  setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
 const btn={disabled:false,textContent:"Create account"};
 const status={setAttribute(){}};
 const entries={
  registerForm:form,submitBtn:btn,status,directLegalAccept:{checked:true},
  companyName:{value:"Synthetic Company"},
  email:{value:"owner@example.test"},
  password:{value:"a synthetic password of length 12"},
  website:{value:""}
 };
 const client={request:async path=>{
  if(path==="/api/auth/registration-proof/challenge")return {token:"synthetic-challenge",difficulty:8};
  if(path==="/api/auth/register"){
   registrations++;
   throw Object.assign(new Error("Uncertain confirmation"),{code:"registration_confirmation_unavailable"});
  }
  throw Error("unexpected request "+path);
 }};
 vm.runInNewContext(directRegistration,{
  TextEncoder,
  document:{getElementById:id=>entries[id]},
  window:{BW:{api:{createClient:()=>client}}},
  crypto:{subtle:{digest:async()=>new Uint8Array(32).buffer}},
  location:{assign:path=>paths.push(path)}
 });
 await submit({preventDefault(){}});
 assert.equal(registrations,1);
 assert.equal(btn.disabled,false);
 assert.equal(btn.textContent,"Go to sign in");
 assert.match(status.textContent,/couldn't confirm whether your account was created/);
 assert.equal(attrs.has("aria-busy"),false);
 await submit({preventDefault(){}});
 assert.equal(registrations,1,"a second submission must not recreate a workspace");
 assert.deepEqual(paths,["/auth.html?mode=login"]);
});


test("direct signup after confirmed creation and failed sign-in never recreates a workspace",async()=>{
 const paths=[],requests=[];
 let submit;
 const form={addEventListener:(_event,handler)=>{submit=handler},setAttribute(){},removeAttribute(){}};
 const btn={disabled:false,textContent:"Create account"};
 const status={setAttribute(){}};
 const elements={registerForm:form,submitBtn:btn,status,directLegalAccept:{checked:true},companyName:{value:"Synthetic Company"},email:{value:"owner@example.test"},password:{value:"synthetic password 12"},website:{value:""}};
 vm.runInNewContext(directRegistration,{
  TextEncoder,
  document:{getElementById:id=>elements[id]},
  window:{BW:{api:{createClient:()=>({request:async path=>{
   requests.push(path);
   if(path==="/api/auth/registration-proof/challenge")return {token:"synthetic-challenge",difficulty:8};
   if(path==="/api/auth/register")return {ok:true};
   if(path==="/api/auth/login")throw Object.assign(new Error("Connection lost"),{code:"network_error"});
   throw new Error("Unexpected request");
  }})}}},
  crypto:{subtle:{digest:async()=>new Uint8Array(32).buffer}},
  location:{assign:path=>paths.push(path)}
 });
 const event={preventDefault(){}};
 await submit(event);
 assert.equal(btn.disabled,false);
 assert.equal(btn.textContent,"Go to sign in");
 await submit(event);
 assert.deepEqual(requests,["/api/auth/registration-proof/challenge","/api/auth/register","/api/auth/login"]);
 assert.deepEqual(paths,["/auth.html?mode=login"]);
});


test("registration deep links enter registration only after verified open or cohort policy",async()=>{
 const from=source.indexOf("async function loadCapabilities(){");
 const to=source.indexOf("\nasync function detectExistingSession()",from);
 assert.ok(from>=0&&to>from);
 for(const [policy,busy,pending,mode,expected] of [
  ["open",false,true,"login",["register"]],
  ["cohort",false,true,"login",["register"]],
  ["hold",false,true,"login",["register"]],
  ["invalid",false,false,"login",[]],
  ["open",true,false,"login",[]],
  ["hold",false,false,"register",["login"]]
 ]){
  const modes=[];
  const ctx={api:async path=>path.endsWith("registration-policy")?{mode:policy}:{google:false,facebook:false},registrationMode:"invalid",pendingRegistrationEntry:pending,busy,mode,
   document:{documentElement:{classList:{remove(){},add(){}}}},registerTab:{},holdNotice:{classList:{toggle(){}}},google:{},facebook:{},submit:{disabled:true},setMode:value=>modes.push(value)};
  await vm.runInNewContext(source.slice(from,to)+"\nloadCapabilities()",ctx);
  assert.deepEqual(modes,expected);
  assert.equal(ctx.pendingRegistrationEntry,false);
  assert.equal(ctx.submit.disabled,busy);
  assert.equal(ctx.registerTab.hidden,!(policy==="open"||policy==="cohort"));
 }
 assert.match(source,/event\.preventDefault\(\);if\(busy\|\|pendingRegistrationEntry\)return/);
 assert.match(source,/if\(registering&&\(registrationMode==="hold"\|\|registrationMode==="invalid"\)\)\{setMode\("login"\)/);
});

test("direct registration requires explicit legal consent before network or proof",async()=>{
 let submit,requests=0,focus=0;
 const form={addEventListener:(_event,handler)=>{submit=handler},setAttribute(){},removeAttribute(){}};
 const btn={disabled:false,textContent:"Create account"};
 const status={setAttribute(){}};
 const entries={registerForm:form,submitBtn:btn,status,companyName:{value:"Synthetic Company"},email:{value:"owner@example.test"},password:{value:"synthetic password 12"},website:{value:""},directLegalAccept:{checked:false,focus(){focus++}}};
 vm.runInNewContext(directRegistration,{TextEncoder,document:{getElementById:id=>entries[id]},window:{BW:{api:{createClient:()=>({request:async()=>{requests++;throw Error("Unexpected network request")}})}}}});
 await submit({preventDefault(){}});
 assert.equal(requests,0);
 assert.equal(focus,1);
 assert.equal(btn.disabled,false);
 assert.match(status.textContent,/Terms of Service/);
 assert.match(directRegistration,/legalAcceptance:\{version:"2026-10-14",accepted:true\}/);
});
