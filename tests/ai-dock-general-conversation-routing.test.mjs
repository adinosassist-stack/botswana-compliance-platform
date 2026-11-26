import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const from=source.indexOf('  function chooseAutomaticAiRoute(');
const to=source.indexOf('  function automaticAiAvailable(',from);
const choose=new Function(source.slice(from,to)+';return chooseAutomaticAiRoute;')();
const enabled={enabled:true,researchEnabled:true};
test('greetings and general business education do not request workspace analysis',()=>{
 for(const q of ['Hello','Hi!','Good morning','What can you do?','How can you help?','What is business cash flow?','What is a company?','How can a small business improve cash flow?']){
  assert.equal(choose(q,enabled),'general',q);
 }
});
test('private requests, mixed greetings and actions retain workspace authorization',()=>{
 for(const q of ['Hello, show my company revenue','What is our business cash flow?','How can my company improve cash flow?','What is the account password?','Approve payment','Send a company report','What is the latest invoice?']){
  assert.equal(choose(q,enabled),'ask',q);
 }
});
test('general conversation still requires activation and excludes existing private context',()=>{
 for(const q of ['Hello','What is business cash flow?']){
  assert.equal(choose(q),'ask');
  assert.equal(choose(q,{...enabled,hasContext:true}),'ask');
 }
 assert.equal(choose('What is the latest business news?',enabled),'web_research');
 assert.equal(choose('What is the latest business news?',{enabled:true}),'research_unavailable');
});
