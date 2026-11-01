import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("../public/js/thebe-assets-summary-client.js",import.meta.url),"utf8");
function client(fetch){const window={fetch};vm.runInNewContext(code,{window});return window.ThebeAssetsSummaryClient}
const capability={enabled:true,authenticated:true,tenantAuthorized:true};
test("disabled or unauthorized capability never creates a loader",()=>{
 const clientFactory=client(()=>{throw new Error("must not fetch")});
 assert.equal(clientFactory.createSummaryLoader({capability:{enabled:false}}),null);
 assert.equal(clientFactory.createSummaryLoader({capability:{enabled:true,authenticated:true}}),null);
});
test("fixed same-origin URL, credentials and validated JSON",async()=>{
 let request;
 const c=client((url,opts)=>{request={url,opts};return Promise.resolve({ok:true,headers:{get:()=>"application/json"},json:async()=>({data:{totalAssets:1,bookValueBwp:500,maintenanceDue:0,insuranceDue:1}})})});
 const result=await c.createSummaryLoader({capability})();
 assert.equal(result.totalAssets,1);
 assert.equal(request.url,"/api/assets/summary");
 assert.equal(request.opts.credentials,"same-origin");
 assert.equal(request.opts.method,"GET");
 assert.equal(request.opts.cache,"no-store");
});
test("rejects malformed or untrusted responses",async()=>{
 const c=client(()=>Promise.resolve({ok:true,headers:{get:()=>"application/json"},json:async()=>({data:{totalAssets:-1,bookValueBwp:50,maintenanceDue:0,insuranceDue:0}})}));
 await assert.rejects(c.createSummaryLoader({capability})(),/invalid_response/);
});
