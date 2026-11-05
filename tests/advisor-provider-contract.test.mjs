import test from 'node:test';
import assert from 'node:assert/strict';
import {advisorProviderInput,advisorProviderOutput} from '../cloudflare/src/advisor-provider-contract.js';
test('GLM uses bounded chat completion and named strict schema without reasoning',()=>{
 const schema={type:'object'},r=advisorProviderInput('@cf/zai-org/glm-4.7-flash','workspace prompt',schema);
 assert.deepEqual(r.messages,[{role:'user',content:'workspace prompt'}]);
 assert.equal(r.chat_template_kwargs.enable_thinking,false);
 assert.equal(r.max_completion_tokens,1000);
 assert.equal(r.response_format.json_schema.schema,schema);
 assert.equal(r.response_format.json_schema.strict,true);
 assert.equal('prompt' in r,false);
});
test('chat answer is taken only from completed visible content; reasoning is never an answer',()=>{
 const content='{"answer":"Recorded answer"}';
 assert.equal(advisorProviderOutput({choices:[{finish_reason:'stop',message:{content,reasoning:'private reasoning'}}]}),content);
 for(const result of [
  {choices:[{finish_reason:'length',message:{content}}]},
  {choices:[{finish_reason:'stop',message:{reasoning:content}}]},
  {choices:[{finish_reason:'stop',message:{content,refusal:'refused'}}]},
  {choices:[{finish_reason:'stop',message:{content,tool_calls:[{}]}}]},
  {choices:[]}
 ])assert.throws(()=>advisorProviderOutput(result),/ai_advisor_/);
});
test('legacy model input and response variants remain supported',()=>{
 assert.equal(advisorProviderInput('legacy-model','prompt',{}).max_tokens,1000);
 assert.equal(advisorProviderOutput({response:'legacy JSON'}),'legacy JSON');
 const raw={answer:'legacy object'};assert.equal(advisorProviderOutput(raw),raw);
});
