import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../public/js/api-client.js",import.meta.url),"utf8");
function setup(transport){
 const calls=[];
 const location={href:"https://thebedesk.com/app/",origin:"https://thebedesk.com",
  hostname:"thebedesk.com",protocol:"https:"};
 const document={querySelector:()=>({})}; // Suppress unrelated owner WhatsApp injection
 const window={document,location,crypto:{randomUUID:()=> "synthetic-request-id"}};
 const sandbox={window,Headers,URL,Response,AbortController,setTimeout,clearTimeout,
  console,fetch:async(url,options)=>{calls.push({url,options});return transport(url,options)}};
 vm.runInNewContext(source,sandbox,{filename:"api-client.js"});
 return {client:window.BW.api.createClient({getCsrfToken:()=> "session-csrf-token-123456",retries:0}),calls};
}
test("central raw transport keeps streamed body, cookies and CSRF for private uploads",async()=>{
 const bytes=Uint8Array.from([1,2,3,4]);
 const ctx=setup(async(url,opt)=>{
  if(opt.method==="GET")return new Response(bytes,{headers:{"content-type":"image/png"}});
  return new Response(new Uint8Array(64),{status:201,headers:{"content-type":"image/png"}});
 });
 const img=await ctx.client.requestRaw("/api/quotation/logo/image",{method:"GET"});
 assert.equal(img.headers.get("content-type"),"image/png");
 assert.deepEqual(new Uint8Array(await img.arrayBuffer()),bytes);
 const upload=await ctx.client.requestRaw("/api/quotation/logo/upload",{
  method:"POST",body:Uint8Array.from([6,7,8]),headers:{"content-type":"image/png"}
 });
 assert.equal(upload.status,201);
 assert.equal(ctx.calls.length,2);
 assert.equal(ctx.calls[1].options.method,"POST");
 assert.equal(ctx.calls[1].options.credentials,"same-origin");
 assert.equal(ctx.calls[1].options.redirect,"error");
 assert.equal(ctx.calls[1].options.headers.get("x-csrf-token"),"session-csrf-token-123456");
 assert.equal(ctx.calls[1].options.headers.get("content-type"),"image/png");
 assert.ok(ctx.calls[1].url.includes("__thebe_api_path"),"raw request reuses root tunnel selected by GET");
});
test("binary GET can fall back through central transports without retrying writes",async()=>{
 const ctx=setup(async(url,opt)=>{
  if(opt.method==="GET"&&url.includes("__thebe_api_path"))return new Response("",{status:404});
  if(opt.method==="GET")return new Response(Uint8Array.from([137,80]),{headers:{"content-type":"image/png"}});
  throw Error("do-not-retry-upload");
 });
 const response=await ctx.client.requestRaw("/api/quotation/logo/image",{method:"GET"});
 assert.equal(response.status,200);
 assert.equal(ctx.calls.length,2,"root 404 falls back to shadow");
 assert.ok(ctx.calls[1].url.includes("/__thebe_api/"));
 await assert.rejects(ctx.client.requestRaw("/api/quotation/logo/upload",{
  method:"POST",body:Uint8Array.from([1,2,3]),
  headers:{"content-type":"image/png"}
 }),/Secure same-origin request failed/);
 assert.equal(ctx.calls.length,3,"mutation sent only once, never auto-replayed after unknown outcome");
 assert.ok(ctx.calls[2].url.includes("/__thebe_api/"));
});
test("raw upload never permits an arbitrary cross-origin destination",async()=>{
 const ctx=setup(async()=>{throw Error("must_not_fetch")});
 await assert.rejects(ctx.client.requestRaw("https://attacker.example/api/quotation/logo/upload",{
  method:"POST",body:Uint8Array.from([1])
 }),/cross-origin|cross_origin_api_blocked/i);
 assert.equal(ctx.calls.length,0);
});
