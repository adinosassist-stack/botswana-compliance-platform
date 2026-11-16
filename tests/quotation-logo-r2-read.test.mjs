import test from "node:test";
import assert from "node:assert/strict";
import {readPrivateQuotationR2Bytes} from "../server/quotation-private-r2-read.mjs";

const bytes=(...n)=>Uint8Array.from(n);
const read=(object,args={})=>readPrivateQuotationR2Bytes(object,{
 minBytes:1,maxBytes:16,...args
});
test("reads real streamed R2 bytes and verifies size",async()=>{
 const data=bytes(1,2,3,4,5);
 const object={size:5,body:new ReadableStream({start(c){
  c.enqueue(data.slice(0,2));c.enqueue(data.slice(2));c.close();
 }})};
 assert.deepEqual(await read(object),data);
});
test("rejects oversized reported size before touching streaming body or buffer",async()=>{
 let accessed=false;
 const obj={size:17,get body(){accessed=true;throw Error("should_not_read")},
  async arrayBuffer(){accessed=true;throw Error("should_not_call")}};
 await assert.rejects(read(obj),/invalid_quotation_private_object/);
 assert.equal(accessed,false);
});
test("rejects bodies lying about declared size, including undersize",async()=>{
 const over={size:3,body:new ReadableStream({start(c){
  c.enqueue(bytes(1,2,3,4));c.close();
 }})};
 await assert.rejects(read(over),/invalid_quotation_private_object/);
 const under={size:4,body:new ReadableStream({start(c){
  c.enqueue(bytes(1,2));c.close();
 }})};
 await assert.rejects(read(under),/invalid_quotation_private_object/);
});
test("rejects missing size instead of buffering unknown-length private object",async()=>{
 let invoked=false;
 const obj={arrayBuffer:async()=>{invoked=true;return bytes(1,2).buffer}};
 await assert.rejects(read(obj),/invalid_quotation_private_object/);
 assert.equal(invoked,false);
});
test("legacy private adapter fallback requires exact declared length",async()=>{
 const data=bytes(1,2,3),fallback={size:data.length,
  arrayBuffer:async()=>data.buffer};
 assert.deepEqual(await read(fallback),data);
 await assert.rejects(read({...fallback,size:data.length+1}),/invalid_quotation_private_object/);
});
test("rejects malformed and missing stream chunks",async()=>{
 const invalid={size:2,body:new ReadableStream({start(c){
  c.enqueue("not-bytes");c.close();
 }})};
 await assert.rejects(read(invalid),/invalid_quotation_private_object/);
 await assert.rejects(read({size:2}),/invalid_quotation_private_object/);
});
