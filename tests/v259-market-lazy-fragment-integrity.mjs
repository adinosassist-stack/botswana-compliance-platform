import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const mono=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a.json","utf8"));
const id="servicesmarketplace";
let hash=0;for(const ch of id)hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
const shardIndex=hash%12;
const shard=JSON.parse(fs.readFileSync(`public/assets/workspace-view-fragments-20261001a-${shardIndex}.json`,"utf8"));
const start=html.indexOf('<section id="servicesmarketplace"');
const inner=html.indexOf(">",start)+1,end=html.indexOf("</section>",inner);
assert(start>=0&&inner>start&&end>inner,"canonical Market section must exist");
const canonical=html.slice(inner,end);
const payloads={canonical,monolithic:mono.views?.[id],shard:shard.views?.[id]};
for(const [label,markup] of Object.entries(payloads)){
 assert.equal(typeof markup,"string",label+" Market payload must exist");
 for(const marker of ["market-v257-hero","market-v257-stats","focusMarketServices()","focusMarketOrders()","Tax-service delivery boundary verified"])
  assert(markup.includes(marker),label+" Market payload missing "+marker);
 assert(!markup.includes('<div class="grid g4">'),label+" must not restore the retired four-card Market header");
}
assert(canonical.includes("gaborone-entrepreneurs-v67.webp"),"canonical Market must retain the Gaborone visual");
for(const [label,markup] of [["monolithic",payloads.monolithic],["shard",payloads.shard]]) assert(!/<(?:script|iframe|object|embed|base|meta|link|img|svg|math|video|audio|source|track)\\b/i.test(markup),label+" lazy Market must stay sanitizer-safe");
assert.equal(payloads.monolithic,payloads.shard,"monolithic and shard lazy Market payloads must be identical");
console.log("V259_MARKET_LAZY_FRAGMENT_INTEGRITY_PASS: canonical Market and sanitizer-safe lazy payloads preserve V257 semantic parity");
