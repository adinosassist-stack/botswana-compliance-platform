import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const from=source.indexOf('  function stopDictation(){');
const to=source.indexOf('  function syncComposerState(){',from);
function fixture(){
 let scope='tenant-a',instance;
 const context=vm.createContext({dictationSession:null,MAX_QUESTION:1000,textBusy:false,savedThreadBusy:false,
  global:{SpeechRecognition:function(){instance=this;this.start=()=>{};this.abort=()=>{this.aborted=true}}},
  audioButton:{attrs:{},setAttribute(k,v){this.attrs[k]=v}},dictationStatus:{hidden:true,textContent:''},input:{value:''},
  document:{documentElement:{lang:'en'}},currentWorkspaceScope:()=>scope,cleanMultiline:(s,n)=>s.trim().slice(0,n),
  stopReadAloud(){},syncComposerHeight(){},syncComposerState(){}});
 vm.runInContext(source.slice(from,to),context);
 return {context,get recognition(){return instance},changeScope(){scope='tenant-b'}};
}
test('dictation is an explicit action that edits a draft without submitting it',()=>{
 const f=fixture();assert.equal(f.recognition,undefined);
 f.context.input.value='Existing draft';f.context.startDictation();
 f.recognition.onresult({results:[[{transcript:'new words'}]]});
 assert.equal(f.context.input.value,'Existing draft new words');
 f.recognition.onresult({results:[[{transcript:'new words again'}]]});
 assert.equal(f.context.input.value,'Existing draft new words again','interim updates do not duplicate prior words');
 assert.doesNotMatch(source.slice(from,to),/api\(|ask\(|requestSubmit/);
});
test('dictation stop blocks late transcript events',()=>{
 const f=fixture();f.context.startDictation();const old=f.recognition;
 f.context.stopDictation();old.onresult({results:[[{transcript:'Late words'}]]});
 assert.equal(f.context.input.value,'');assert.equal(old.aborted,true);
});
test('dictation never overwrites manually changed drafts or a new workspace',()=>{
 const f=fixture();f.context.startDictation();f.context.input.value='Typed manually';
 f.recognition.onresult({results:[[{transcript:'Spoken words'}]]});
 assert.equal(f.context.input.value,'Typed manually');assert.equal(f.recognition.aborted,true);
 f.context.startDictation();f.changeScope();
 f.recognition.onresult({results:[[{transcript:'Foreign words'}]]});
 assert.equal(f.context.input.value,'Typed manually');
});
test('permission failure leaves a retryable editable draft',()=>{
 const f=fixture();f.context.input.value='Preserve me';f.context.startDictation();
 f.recognition.onerror({error:'not-allowed'});
 assert.equal(f.context.input.value,'Preserve me');
 assert.match(f.context.dictationStatus.textContent,/Allow microphone access/);
 assert.equal(f.context.audioButton.attrs['aria-pressed'],'false');
 f.context.startDictation();assert.equal(f.context.audioButton.attrs['aria-pressed'],'true');
});
test('live voice and dictation cannot acquire the microphone together',()=>{
 const f=fixture();f.context.global.ThebeLiveVoice={status:()=>({state:'connected'})};
 f.context.startDictation();assert.equal(f.recognition,undefined);
 assert.match(f.context.dictationStatus.textContent,/End live voice/);
});
