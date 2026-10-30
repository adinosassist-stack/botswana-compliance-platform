import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportR2Binding} from "../server/ai-export-r2-binding.js";
test("R2 binding writes private object and reads only unexpired",async()=>{
 let item=null;const adapter=createAiExportR2Binding({binding:{put:async(k,b,o)=>{item={k,b,o}},get:async()=>({customMetadata:item.o.customMetadata,size:item.b.length,arrayBuffer:async()=>item.b})}});
 await adapter.putObject({key:"ai-exports/t1/j1",body:Buffer.from("%PDF"),visibility:"private",expiresAt:Date.now()+300000});
 assert.equal((await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"})).toString(),"%PDF");
 assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"public"}),null);
});
test("denies expired objects and never returns a public URL",async()=>{
 const adapter=createAiExportR2Binding({binding:{put:async()=>{},get:async()=>({customMetadata:{expiresAt:"1"},size:6,arrayBuffer:async()=>Buffer.from("secret")})}});
 assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"}),null);
 await assert.rejects(adapter.putObject({key:"x",body:Buffer.from("x"),visibility:"public",expiresAt:1}));
});

test("missing expiry and excessive size fail closed before reading bytes",async()=>{
 let reads=0;
 const adapter=createAiExportR2Binding({binding:{put:async()=>{},get:async key=>({customMetadata:key.endsWith("missing")?{}:{expiresAt:String(Date.now()+60000)},size:key.endsWith("huge")?20*1024*1024+1:4,arrayBuffer:async()=>{reads++;return Buffer.from("%PDF")}})}});
 assert.equal(await adapter.getObject({key:"ai-exports/t1/missing",visibility:"private"}),null);
 assert.equal(await adapter.getObject({key:"ai-exports/t1/huge",visibility:"private"}),null);
 assert.equal(reads,0);
});
test("private R2 refuses expired writes, invalid object keys and oversized input",async()=>{
 let writes=0;
 const adapter=createAiExportR2Binding({binding:{put:async()=>{writes++},get:async()=>null},clock:()=>1000});
 await assert.rejects(adapter.putObject({key:"ai-exports/t1/j1",body:Buffer.from("x"),visibility:"private",expiresAt:999}));
 await assert.rejects(adapter.putObject({key:"../public",body:Buffer.from("x"),visibility:"private",expiresAt:2000}));
 await assert.rejects(adapter.putObject({key:"ai-exports/t1/j1",body:Buffer.alloc(20*1024*1024+1),visibility:"private",expiresAt:2000}));
 assert.equal(writes,0);
});

test("rejects missing R2 size before reading file body",async()=>{
 let bytesRead=0;
 const b=createAiExportR2Binding({clock:()=>1000,binding:{put:async()=>{},get:async()=>({customMetadata:{expiresAt:"2000"},arrayBuffer:async()=>{bytesRead++;return Buffer.from("private")}})}});
 assert.equal(await b.getObject({key:"ai-exports/t1/j1",visibility:"private"}),null);
 assert.equal(bytesRead,0);
});

test("private R2 records a SHA-256 digest and denies tampering after upload",async()=>{
 let item=null;
 const adapter=createAiExportR2Binding({clock:()=>1000,binding:{
  put:async(key,body,options)=>{item={key,body:Buffer.from(body),metadata:options.customMetadata}},
  get:async()=>({size:item.body.length,customMetadata:item.metadata,arrayBuffer:async()=>item.body})
 }});
 await adapter.putObject({key:"ai-exports/t1/j1",body:Buffer.from("%PDF-original"),visibility:"private",expiresAt:2000});
 assert.match(item.metadata.sha256,/^[a-f0-9]{64}$/);
 assert.equal((await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"})).toString(),"%PDF-original");
 item.body=Buffer.from("%PDF-forged!!"); // Length preserved; digest differs.
 assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"}),null);
});
test("R2 missing or malformed integrity metadata fails closed without retrieving object bytes",async()=>{
 let reads=0;
 const hashes=[undefined,"invalid","F".repeat(64),"a".repeat(63)];
 for(const hash of hashes){
  const metadata={expiresAt:"2000",...(hash===undefined?{}:{sha256:hash})};
  const adapter=createAiExportR2Binding({clock:()=>1000,binding:{
   put:async()=>{},get:async()=>({size:9,customMetadata:metadata,arrayBuffer:async()=>{reads++;return Buffer.from("%PDF-data")}})
  }});
  assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"}),null);
 }
 assert.equal(reads,0);
});
test("R2 rejects a payload whose reported size differs from retrieved bytes",async()=>{
 const {createHash}=await import("node:crypto");
 let reads=0;const actual=Buffer.from("%PDF-body");
 const adapter=createAiExportR2Binding({clock:()=>1000,binding:{
  put:async()=>{},get:async()=>({size:actual.length+1,customMetadata:{expiresAt:"2000",sha256:createHash("sha256").update(actual).digest("hex")},arrayBuffer:async()=>{reads++;return actual}})
 }});
 assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"}),null);
 assert.equal(reads,1);
});
