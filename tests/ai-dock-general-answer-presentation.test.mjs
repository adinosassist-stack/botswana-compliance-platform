import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const from=source.indexOf('  function renderResult(result,');
const to=source.indexOf('  function renderGoalPlan(',from);
function render(result,presentation){
 let summaries=0;
 const el=(tag,className,text='')=>({tag,className,text,children:[],append(...nodes){this.children.push(...nodes)},setAttribute(){},addEventListener(){}});
 const box=el('section','response');box.dataset={};box.replaceChildren=()=>{box.children=[]};
 const context=vm.createContext({responseBox:box,el,setMascotFocus(){},setMascotState(){},appendAdvisorRunSummary(){summaries++},
  cleanMultiline:value=>value,clean:value=>String(value),responseAnswer:text=>el('div','answer',text),surfaceLatestResponse(){}});
 vm.runInContext(source.slice(from,to),context);
 context.renderResult(result,presentation);
 const texts=node=>[node.text,...node.children.flatMap(texts)];
 return {summaries,texts:texts(box)};
}
test('general answers omit workspace analysis and workspace navigation',()=>{
 const result=render({answer:'Cash flow is money moving in and out.'},'general');
 assert.equal(result.summaries,0);
 assert(!result.texts.includes('Open workspace AI'));
 assert(!result.texts.includes('Thebe workspace response'));
 assert(result.texts.includes('Copy answer'));
 assert(result.texts.includes('Cash flow is money moving in and out.'));
});
test('workspace responses retain their analysis and workspace control',()=>{
 const result=render({answer:'Your authorized workspace answer.'});
 assert.equal(result.summaries,1);
 assert(result.texts.includes('Open workspace AI'));
});

test('provider fields cannot suppress workspace governance presentation',()=>{
 const result=render({answer:'Workspace answer.',surface:'general'});
 assert.equal(result.summaries,1);
 assert(result.texts.includes('Open workspace AI'));
});
