import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const first=html.indexOf("async function saveWizardFirstStep(){");
const last=html.indexOf("\nfunction wizardMove(dir){",first);
assert.ok(first>0&&last>first,"first-step implementation exists");
const functionCode=html.slice(first,last);

function harness({failed=false,role="owner",deferred=false}={}){
 let writes=0,focuses=0,resolutions=[];
 const button={disabled:false,textContent:"Next"};
 const inlineError={textContent:"",classList:{add:()=>{}}};
 const state={profile:{name:"Original Business",town:"Gaborone",entityType:"",industry:"Retail",employees:0}};
 const context={
  wizardStep:0,currentUser:{role},
  currentWorkspaceRole:()=>role,
  state,structuredClone,
  wizardInlineError:inlineError,wizardNext:button,
  wName:{value:"Original Business"},
  wEntityType:{value:"company"},
  wIndustry:{value:"Construction"},
  wEmployees:{value:"5"},
  document:{
   getElementById:()=>button,
   querySelector:()=>({focus:()=>{focuses++}})
  },
  updateActiveCompany:mutate=>{
   const next={profile:{...state.profile}};
   mutate(next);state.profile=next.profile;
  },
  persistWorkspaceState:async()=>{
   writes++;
   if(deferred)await new Promise((resolve,reject)=>resolutions.push({resolve,reject}));
   if(failed)throw Error("Unavailable");
  },
  renderWizard:()=>{},
 };
 const run=vm.runInNewContext(functionCode+";saveWizardFirstStep",context);
 return {run,context,state,button,inlineError,get writes(){return writes},get focuses(){return focuses},resolutions};
}

test("owner first step saves authoritative tenant state before advancing",async()=>{
 const h=harness();
 assert.equal(await h.run(),true);
 assert.equal(h.writes,1);
 assert.equal(h.context.wizardStep,1);
 assert.equal(h.state.profile.town,"Gaborone");
 assert.equal(h.state.profile.entityType,"company");
 assert.equal(h.state.profile.employees,5);
 assert.equal(h.button.disabled,false);
});

test("failed server write does not advance and rolls back incomplete checkpoint",async()=>{
 const h=harness({failed:true});
 assert.equal(await h.run(),false);
 assert.equal(h.writes,1);
 assert.equal(h.context.wizardStep,0);
 assert.equal(h.state.profile.onboardingDraftStep,undefined);
 assert.equal(h.state.profile.entityType,"");
 assert.match(h.inlineError.textContent,/Step not saved/);
 assert.equal(h.button.disabled,false);
});

test("save-in-progress suppresses a second mutation",async()=>{
 const h=harness({deferred:true});
 const firstCall=h.run();
 assert.equal(h.writes,1);
 assert.equal(h.button.disabled,true);
 assert.equal(await h.run(),false);
 assert.equal(h.writes,1);
 h.resolutions[0].resolve();
 assert.equal(await firstCall,true);
 assert.equal(h.button.disabled,false);
});

test("non-owner cannot save or advance setup",async()=>{
 const h=harness({role:"manager"});
 assert.equal(await h.run(),false);
 assert.equal(h.writes,0);
 assert.equal(h.context.wizardStep,0);
});

test("resume is conditioned on server-backed profile and incomplete owner setup",()=>{
 const start=html.indexOf("function openOnboarding(){");
 const end=html.indexOf("\nfunction dismissOnboarding(){",start);
 const flow=html.slice(start,end);
 assert.match(flow,/!currentUser\?\.onboardingComplete/);
 assert.match(flow,/state\.profile\?\.entityType/);
 assert.match(flow,/wizardStep=.*\?1:0/);
 assert.doesNotMatch(flow,/localStorage|sessionStorage/);
});

test("legacy quick start remains two steps and never marks completion on checkpoint",()=>{
 const start=html.indexOf("async function saveWizardFirstStep(){");
 const end=html.indexOf("\nfunction wizardMove(dir){",start);
 const firstStep=html.slice(start,end);
 assert.match(firstStep,/await persistWorkspaceState\(\)/);
 assert.doesNotMatch(firstStep,/\/api\/account\/onboarding\/complete/);
 assert.match(html,/firstProtectionCheckStatus:"pending"/);
 assert.match(html,/if\(dir>0&&wizardStep===0\)\{void saveWizardFirstStep\(\);return\}/);
 assert.match(html,/id="wizardInlineError"[^>]*role="alert"/);
 assert.match(html,/h3>2\. Tick what the business does today/);
});
