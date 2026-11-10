import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const start=source.indexOf('  function requireAdvisorAnswer(result){');
const end=source.indexOf('  function renderResult(result){',start);
assert.ok(start>=0&&end>start,'fail-closed advisor answer guard exists');
const context=vm.createContext({});
vm.runInContext(source.slice(start,end),context);
const validate=value=>context.requireAdvisorAnswer(value);

test('advisor results only show success for actual nonempty text',()=>{
  const valid={answer:'Grounded workspace answer',actions:[]};
  assert.equal(validate(valid),valid);
  assert.equal(validate({answer:'  A meaningful answer.  '}).answer,'  A meaningful answer.  ');
});

test('empty and malformed responses cannot fabricate an AI answer',()=>{
  for(const value of [undefined,null,false,[],{}, {answer:''}, {answer:'  '}, {answer:'\t'}, {answer:0}, {answer:{text:'private'}}, {error:'ai_unavailable'}, {answer:null}]){
    assert.throws(()=>validate(value),/Thebe did not return an answer/);
  }
});

test('normal advisor response checks the answer before clearing pending attachments or rendering success',()=>{
  const begin=source.indexOf('      const result=await api("/api/ai/advisor",{');
  const finish=source.indexOf('    }catch(error){',begin);
  assert.ok(begin>=0&&finish>begin);
  const block=source.slice(begin,finish);
  const checked=block.indexOf('requireAdvisorAnswer(result);');
  const cleared=block.indexOf('pendingFiles=pendingFiles.filter(');
  const rendered=block.indexOf('renderResult(result);');
  assert.ok(checked>=0&&cleared>checked&&rendered>cleared);
  assert.doesNotMatch(block,/renderResult\\(result\\|\\|\\{\\}\\)/);
});
