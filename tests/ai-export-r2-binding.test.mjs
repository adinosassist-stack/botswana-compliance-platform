import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportR2Binding} from "../server/ai-export-r2-binding.js";
test("R2 binding writes private object and reads only unexpired",async()=>{
 let item=null;const adapter=createAiExportR2Binding({binding:{put:async(k,b,o)=>{item={k,b,o}},get:async()=>({customMetadata:item.o.customMetadata,arrayBuffer:async()=>item.b})}});
 await adapter.putObject({key:"ai-exports/t1/j1",body:Buffer.from("%PDF"),visibility:"private",expiresAt:Date.now()+300000});
 assert.equal((await adapter.getObject({key:"ai-exports/t1/j1",visibility:"private"})).toString(),"%PDF");
 assert.equal(await adapter.getObject({key:"ai-exports/t1/j1",visibility:"public"}),null);
});
test("denies expired objects and never returns a public URL",async()=>{
 const adapter=createAiExportR2Binding({binding:{put:async()=>{},get:async()=>({customMetadata:{expiresAt:"1"},arrayBuffer:async()=>Buffer.from("secret")})}});
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
