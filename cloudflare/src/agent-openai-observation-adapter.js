import {runAgentModelObservation} from "./agent-model-observation-runner.js";

const ENDPOINT="https://api.openai.com/v1/responses";
const validTokens=n=>Number.isSafeInteger(n)&&n>=0;
async function boundedJson(response){
  if(!response.body)throw new Error("openai_response_unavailable");
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>1048576){await reader.cancel();throw new Error("openai_response_too_large")}
      chunks.push(value);
    }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error("openai_response_invalid")}
}

// Server-only factory. Credentials remain in the closure; no browser route,
// alternate endpoint, retries, tools, conversation state or stored response.
export function createOpenAIObservationAdapter(env,{fetchImpl=globalThis.fetch}={}){
  if(String(env?.AGENT_MODEL_OPENAI_ENABLED??"").trim()!=="1"||typeof fetchImpl!=="function")return null;
  return async function observe({model,prompt,maxOutputTokens,signal}={}){
    if(String(env?.AGENT_MODEL_OPENAI_ENABLED??"").trim()!=="1")throw new Error("openai_adapter_disabled");
    const key=String(env?.OPENAI_API_KEY??"").trim();
    if(key.length<=20)throw new Error("openai_credentials_unavailable");
    let catalog;
    try{catalog=JSON.parse(String(env?.AGENT_APPROVED_MODELS_JSON??"[]"))}catch{throw new Error("openai_catalog_unavailable")}
    const approved=Array.isArray(catalog)&&catalog.find(m=>m?.id===model&&m?.provider==="openai"&&m?.enabled===true&&m?.externalProcessingApproved===true);
    if(!approved||typeof prompt!=="string"||!prompt.trim()||new TextEncoder().encode(prompt).byteLength>16384||
      !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<16||maxOutputTokens>8192||maxOutputTokens!==approved.maxOutputTokens)
      throw new Error("openai_request_not_approved");
    const response=await fetchImpl(ENDPOINT,{method:"POST",redirect:"error",signal,
      headers:{authorization:`Bearer ${key}`,"content-type":"application/json","accept":"application/json"},
      body:JSON.stringify({model,input:prompt,max_output_tokens:maxOutputTokens,store:false,stream:false,tools:[]})});
    if(!response.ok)throw new Error("openai_provider_unavailable");
    const payload=await boundedJson(response);
    const usage=validTokens(payload?.usage?.input_tokens)&&validTokens(payload?.usage?.output_tokens)
      ?{inputTokens:payload.usage.input_tokens,outputTokens:payload.usage.output_tokens}:null;
    // Usage is still returned for incomplete/invalid output so billed work can
    // be settled. Require a pinned response model to avoid pricing a different model.
    if(payload?.model!==model)return {text:null,usage:null};
    const text=payload?.status==="completed"&&!payload?.error&&Array.isArray(payload.output)
      ?payload.output.filter(item=>item?.type==="message"&&item?.role==="assistant"&&item?.status==="completed")
        .flatMap(item=>Array.isArray(item.content)?item.content:[])
        .filter(item=>item?.type==="output_text"&&typeof item.text==="string").map(item=>item.text).join("\n"):null;
    return {text,usage};
  };
}

export function runOpenAIModelObservation({env,auth,input,fetchImpl=globalThis.fetch}={}){
  const adapter=createOpenAIObservationAdapter(env,{fetchImpl});
  return runAgentModelObservation({env,auth,input,adapters:adapter?{openai:adapter}:{}});
}
