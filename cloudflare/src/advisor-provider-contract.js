// Keep the provider envelope separate from the governed answer and citation validator.
export function advisorProviderInput(model,prompt,schema){
 if(model==='@cf/zai-org/glm-4.7-flash')return {
  messages:[{role:'user',content:prompt}],
  chat_template_kwargs:{enable_thinking:false},
  response_format:{type:'json_schema',json_schema:{name:'advisor_answer',schema,strict:true}},
  max_completion_tokens:1000,temperature:0.1
 };
 return {prompt,response_format:{type:'json_schema',json_schema:schema},max_tokens:1000,temperature:0.1};
}
export function advisorProviderOutput(result){
 if(result&&typeof result==='object'&&Array.isArray(result.choices)){
  const choice=result.choices[0];
  if(choice?.finish_reason!=='stop')throw Error('ai_advisor_incomplete_output');
  const message=choice.message;
  if(message?.refusal||message?.tool_calls?.length||message?.function_call)throw Error('ai_advisor_invalid_output');
  if(typeof message?.content!=='string'||!message.content.trim())throw Error('ai_advisor_answer_missing');
  return message.content;
 }
 return result&&typeof result==='object'&&'response' in result?result.response:result;
}
