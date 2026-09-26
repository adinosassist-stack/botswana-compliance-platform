import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__agenticLiveVoiceTest as live} from "../cloudflare/src/agentic-live-voice.js";

for(const path of ["cloudflare/src/agentic-live-voice.js","public/js/thebe-live-voice.js","cloudflare/src/production-entry.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.deepEqual(live.SUPPORTED_VOICE_LANGUAGES.map(item=>item.key),["english","setswana","sekalaka"]);
assert.deepEqual(live.SUPPORTED_VOICE_LANGUAGES.map(item=>item.label),["English","Setswana","Sekalaka"]);
assert.equal(live.normalizeVoiceLanguage("English"),"english");
assert.equal(live.normalizeVoiceLanguage("tn"),"setswana");
assert.equal(live.normalizeVoiceLanguage("Tswana"),"setswana");
assert.equal(live.normalizeVoiceLanguage("Sekalaka"),"sekalaka");
assert.equal(live.normalizeVoiceLanguage("unknown"),null);

const auto=live.languagePreferenceFromMemory({items:[]});
assert.equal(auto.mode,"auto");
assert.equal(auto.primary,null);
assert.equal(auto.source,"auto_mirror");
assert.equal(auto.authoritative,false);
const pref=live.languagePreferenceFromMemory({items:[
  {id:"m1",namespace:"finance",key:"primary",value:"english"},
  {id:"m2",namespace:"language",key:"primary",value:"sekalaka"}
]});
assert.equal(pref.mode,"preferred");
assert.equal(pref.primary,"sekalaka");
assert.equal(pref.label,"Sekalaka");
assert.equal(pref.authoritative,false);

const instructions=live.instructions(pref);
assert.match(instructions,/English, Setswana, and Sekalaka/);
assert.match(instructions,/never invent vocabulary/i);
assert.match(instructions,/owner-confirmed preferred language is Sekalaka/i);
assert.match(instructions,/explicit language change/i);
assert.match(instructions,/Never approve or execute an internal task from voice/i);
assert.match(instructions,/Never approve, authorize or execute payments/i);

const config=live.realtimeSessionConfig(pref);
assert.match(config.instructions,/Sekalaka/);
assert.equal(config.tools.length,1);
assert.equal(config.tools[0].name,"delegate_to_thebe_backend");

const backend=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(backend,/listBusinessMemory\(env,tenantId\)/);
assert.match(backend,/loadVoiceLanguagePreference\(env,auth\.tenant_id\)/);
assert.match(backend,/preferredLanguage:languagePreference\.primary\|\|"auto"/);
assert.match(backend,/codeSwitching:true/);
assert.match(backend,/financial|payment|human_only/i);
assert.doesNotMatch(backend,/voiceMayExecuteInternalTask:true/);
assert.doesNotMatch(backend,/voiceMayBypassRuntimeGuard:true/);

const client=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
assert.match(client,/thebeLiveVoiceLanguage/);
assert.match(client,/\/api\/business-memory/);
assert.match(client,/namespace:"language",key:"primary"/);
assert.match(client,/workspaceRole\(\)!=="owner"/);
assert.match(client,/Auto language/);
assert.match(client,/\["english","setswana","sekalaka"\]/);
assert.match(client,/preferredLanguage:languageSelect\?\.value\|\|"auto"/);

const css=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");
assert.match(css,/\.thebe-live-language\{/);
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
assert.match(production,/THEBE_LIVE_VOICE_RELEASE="20260926-v159"/);
assert.match(production,/THEBE_AI_DOCK_RELEASE="20260926-v159"/);

console.log("v159 English + Setswana + Sekalaka live voice contract passed");
