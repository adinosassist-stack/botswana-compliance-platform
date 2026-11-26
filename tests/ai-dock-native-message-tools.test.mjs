import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const from=source.indexOf('  let readAloudUtterance=null;');
const to=source.indexOf('  function appendConversationTurn(',from);
function fixture({supported=true}={}){
 let scope='tenant-a:owner-a',cancels=0;
 const spoken=[],shared=[];
 const el=(tag,className,text='')=>({tag,className,text,children:[],attrs:{},append(...items){this.children.push(...items)},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this[k]=v}});
 const global=supported?{speechSynthesis:{speak:u=>spoken.push(u),cancel:()=>{cancels++}},SpeechSynthesisUtterance:function(text){this.text=text},navigator:{share:async data=>{shared.push(data)}}}:{};
 const context=vm.createContext({global,document:{documentElement:{lang:'en'}},dock:{hidden:false},currentWorkspaceScope:()=>scope,
 cleanMultiline:(s,n)=>String(s).slice(0,n),el,appendControlIcon(){}});
 vm.runInContext(source.slice(from,to),context);
 const mount=text=>{const host=el('section','host');context.appendMessageTools(host,text);return host};
 const buttons=host=>host.children[0]?.children.filter(x=>x.tag==='button')||[];
 return {context,global,spoken,shared,mount,buttons,get cancels(){return cancels},changeScope(){scope='tenant-b:owner-b'}};
}
test('native answer actions do nothing until explicitly pressed and retain answer snapshots',async()=>{
 const f=fixture(),first=f.mount('First answer'),second=f.mount('Second answer');
 assert.equal(f.spoken.length,0);assert.equal(f.shared.length,0);
 f.buttons(first)[0].click();
 assert.equal(f.spoken[0].text,'First answer');
 await f.buttons(second)[1].click();
 assert.equal(f.shared[0].text,'Second answer');
 assert(!Object.hasOwn(f.shared[0],'url'),'sharing never adds private workspace URL');
});
test('unsupported native features do not offer nonfunctional controls',()=>{
 const f=fixture({supported:false});assert.equal(f.mount('Answer').children.length,0);
});
test('scope changes prevent reading and sharing a prior tenant answer',async()=>{
 const f=fixture(),host=f.mount('Private answer');f.changeScope();
 f.buttons(host)[0].click();await f.buttons(host)[1].click();
 assert.equal(f.spoken.length,0);assert.equal(f.shared.length,0);
});
test('read aloud can be stopped and stale end events cannot stop a newer answer',()=>{
 const f=fixture(),a=f.mount('First'),b=f.mount('Second');
 const first=f.buttons(a)[0],second=f.buttons(b)[0];
 first.click();const old=f.spoken[0];second.click();
 assert.equal(first.attrs['aria-pressed'],'false','replaced speech resets its control');
 old.onend();
 assert.equal(second.attrs['aria-pressed'],'true');
 second.click();assert.equal(second.attrs['aria-pressed'],'false');
 assert.equal(f.cancels,2);
});
test('share cancellation does not claim success or display failure',async()=>{
 const f=fixture();f.global.navigator.share=async()=>{const error=Error();error.name='AbortError';throw error};
 const host=f.mount('Answer'),share=f.buttons(host)[1];await share.click();
 assert.equal(share.disabled,false);
 assert.equal(host.children[0].children.at(-1).textContent,'');
});
