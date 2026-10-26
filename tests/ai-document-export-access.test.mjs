import assert from "node:assert/strict";
import {test} from "node:test";
import {authorizeExportJob,authorizeExportDownload} from "../server/ai-document-export-access.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"t1",actorId:"a1"};
const job={id:"j1",tenantId:"t1",actorId:"a1",expiresAt:2000000300,status:"completed",objectKey:"ai-exports/t1/j1"};
test("completed export is available only to originating tenant member",()=>{
 assert.equal(authorizeExportDownload(job,actor,2000000000).allowed,true);
 for(const identity of [{...actor,tenantId:"t2"},{...actor,actorId:"a2"},{...actor,workspaceMember:false},{...actor,authenticated:false},null])
   assert.equal(authorizeExportDownload(job,identity,2000000000).allowed,false);
});
test("expired or invalid export jobs fail closed",()=>{
 for(const now of [undefined,-1,2000000300,2000000400,"2000000000"])
   assert.equal(authorizeExportJob(job,actor,now).allowed,false);
});
test("pending jobs and mismatched object keys cannot download",()=>{
 for(const changes of [{status:"pending"},{status:"failed"},{objectKey:"ai-exports/t2/j1"},{objectKey:"public.pdf"},{objectKey:null}])
   assert.equal(authorizeExportDownload({...job,...changes},actor,2000000000).allowed,false);
});
