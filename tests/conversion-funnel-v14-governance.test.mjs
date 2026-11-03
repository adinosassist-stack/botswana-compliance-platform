import assert from 'node:assert/strict';
import test from 'node:test';
import {handleConversionEvent} from '../cloudflare/src/conversion-funnel-governance.js';

const path='/api/marketing/conversion-event';
const event={conversionId:'12345678-1234-1234-1234-123456789abc',stage:'market_view',source:'market',plan:'',path:'/'};
function request(body=event,origin='https://thebedesk.com'){
  return new Request('https://thebedesk.com'+path,{method:'POST',headers:{origin},body:JSON.stringify(body)});
}
function environment(result={success:true}){
  const writes=[];
  return {writes,env:{PUBLIC_RATE_LIMITER:{limit:async()=>result},DB:{prepare(sql){
    return {bind(...values){return {run:async()=>{writes.push({sql,values})}}}};
  }}}};
}
test('invalid origin and server-only stages never write conversion records',async()=>{
  for(const req of [request(event,'https://other.example'),request({...event,stage:'registration_success'}),request({...event,stage:'workspace_reached'})]){
    const {writes,env}=environment();
    const response=await handleConversionEvent({request:req,path,env});
    assert([400,403].includes(response.status));
    assert.equal(writes.length,0);
  }
});
test('missing, denied, or malformed limiter verdicts cannot admit a write',async()=>{
  for(const result of [undefined,{}, {success:false}]){
    const f=environment(result);
    if(result===undefined)delete f.env.PUBLIC_RATE_LIMITER;
    const response=await handleConversionEvent({request:request(),path,env:f.env});
    assert.equal(response.status,429);
    assert.equal(f.writes.length,0);
  }
});
test('unadvertised oversized body is rejected while streaming',async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(2049))},cancel(){cancelled=true}});
  const req=new Request('https://thebedesk.com'+path,{method:'POST',headers:{origin:'https://thebedesk.com'},body,duplex:'half'});
  const {writes,env}=environment();
  const response=await handleConversionEvent({request:req,path,env});
  assert.equal(response.status,413);
  assert.equal(cancelled,true);
  assert.equal(writes.length,0);
});
test('admitted event uses the isolated audit partition and parameterized data',async()=>{
  const {writes,env}=environment();
  const response=await handleConversionEvent({request:request(),path,env});
  assert.equal(response.status,202);
  assert.equal(writes.length,1);
  assert.equal(writes[0].values[0],'public-market');
  assert.equal(writes[0].values[1],'MARKETING_MARKET_VIEW');
  assert.equal(writes[0].values[2],event.conversionId);
  assert.equal(JSON.parse(writes[0].values[3]).stage,'market_view');
});
