import fs from "node:fs";import path from "node:path";import zlib from "node:zlib";
const root=process.cwd(),bytes=p=>fs.readFileSync(path.join(root,p)),kb=n=>Math.round(n/1024);
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL ${checks}: ${m}`)};
const worker=bytes("cloudflare/src/worker.js"),html=bytes("public/index.html"),workspaceRuntime=bytes("public/js/workspace-runtime-20260926b.js"),workspaceStyles=bytes("public/assets/workspace-inline-styles-20260926b.css"),workspaceViews=bytes("public/assets/workspace-view-fragments-20260923f.json");
const workspaceViewShards=Array.from({length:12},(_,i)=>bytes(`public/assets/workspace-view-fragments-20260923f-${i}.json`));
const htmlText=html.toString("utf8"),runtimeText=workspaceRuntime.toString("utf8"),stylesText=workspaceStyles.toString("utf8"),workspaceViewsPayload=JSON.parse(workspaceViews.toString("utf8"));
const workspaceViewShardPayloads=workspaceViewShards.map(buffer=>JSON.parse(buffer.toString("utf8")));
const workspaceViewShardFor=id=>{let hash=0;for(const ch of String(id||""))hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;return hash%12};
const inlineMatch=htmlText.match(/<script id="thebe-workspace-runtime-inline">([\s\S]*?)<\/script>/);
ok(!!inlineMatch,"canonical inline workspace runtime marker missing");
const normalizedInline=String(inlineMatch?.[1]||"").replace(/^\n/,"").replace(/\s*$/,"")+"\n";
ok(normalizedInline===runtimeText,"versioned workspace runtime must exactly match canonical inline source");
const headEnd=htmlText.toLowerCase().indexOf("</head>");
ok(headEnd>0,"canonical workspace head missing");
const headText=htmlText.slice(0,headEnd);
const canonicalStyles=[...headText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match=>String(match[1]||"").replace(/^\n/,"").replace(/\s*$/,""));
ok(canonicalStyles.length===49,`unexpected canonical workspace style count (${canonicalStyles.length})`);
const normalizedStyles=canonicalStyles.join("\n\n")+"\n";
ok(normalizedStyles===stylesText,"versioned workspace stylesheet must exactly match canonical head styles");

const residentViews=new Set(workspaceViewsPayload.residentViews||[]);
const lazyViewIds=Object.keys(workspaceViewsPayload.views||{});
ok(workspaceViewsPayload.schema===1,"workspace view fragment schema mismatch");
const expectedResident=["dashboard","moneyhub","workhub","sites","peopleops","businesshub","obligations","evidencehub","automationhub"];
ok(expectedResident.every(id=>residentViews.has(id))&&residentViews.size===expectedResident.length,"workspace resident view contract mismatch");
ok(lazyViewIds.length===62,`unexpected lazy workspace view count (${lazyViewIds.length})`);
function viewSectionBounds(source,start){
  const openEnd=source.indexOf(">",start)+1,token=/<\/?section\b[^>]*>/gi;token.lastIndex=start;let depth=0,match;
  while((match=token.exec(source))){if(/^<section\b/i.test(match[0]))depth++;else depth--;if(depth===0)return {openEnd,closeStart:match.index,end:token.lastIndex}}
  return null;
}
for(const id of lazyViewIds){
  const match=new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*>`,"i").exec(htmlText);
  ok(!!match,`canonical lazy view missing (${id})`);
  const bounds=viewSectionBounds(htmlText,match.index);ok(!!bounds,`canonical lazy view bounds missing (${id})`);
  ok(htmlText.slice(bounds.openEnd,bounds.closeStart)===workspaceViewsPayload.views[id],`lazy view fragment drift (${id})`);
}
const runtimeExternalizedHtml=htmlText.replace(/<script id="thebe-workspace-runtime-inline">[\s\S]*?<\/script>/,'<script id="thebe-workspace-runtime" src="/js/workspace-runtime-20260926b.js"></script>');
const runtimeHeadEnd=runtimeExternalizedHtml.toLowerCase().indexOf("</head>");
const runtimeHead=runtimeExternalizedHtml.slice(0,runtimeHeadEnd),runtimeTail=runtimeExternalizedHtml.slice(runtimeHeadEnd);
let styleCount=0;
const deployedHead=runtimeHead.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,()=>{styleCount++;return styleCount===1?'<link id="thebe-workspace-inline-styles" rel="stylesheet" href="/assets/workspace-inline-styles-20260926b.css" />':""});
ok(styleCount===49,`deployed workspace style extraction count mismatch (${styleCount})`);
let deployedHtmlText=deployedHead+runtimeTail;
const viewReplacements=[];
for(const id of lazyViewIds){
  const match=new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*>`,"i").exec(deployedHtmlText);
  ok(!!match,`deployed lazy view missing (${id})`);
  const bounds=viewSectionBounds(deployedHtmlText,match.index);ok(!!bounds,`deployed lazy view bounds missing (${id})`);
  const openTag=deployedHtmlText.slice(match.index,bounds.openEnd);
  viewReplacements.push({start:match.index,end:bounds.end,placeholder:`${openTag.slice(0,-1)} data-lazy-view="1" data-lazy-view-id="${id}" aria-busy="false"></section>`});
}
for(const replacement of viewReplacements.sort((a,b)=>b.start-a.start))deployedHtmlText=deployedHtmlText.slice(0,replacement.start)+replacement.placeholder+deployedHtmlText.slice(replacement.end);
const deployedHtml=Buffer.from(deployedHtmlText,"utf8");
const workerGzip=zlib.gzipSync(worker,{level:9}),htmlGzip=zlib.gzipSync(html,{level:9}),deployedHtmlGzip=zlib.gzipSync(deployedHtml,{level:9});
ok(worker.length<1_500_000,`Worker source budget exceeded (${kb(worker.length)} KiB)`);
ok(workerGzip.length<512_000,`Worker gzip headroom budget exceeded (${kb(workerGzip.length)} KiB)`);
ok(html.length<1_200_000,`canonical application HTML budget exceeded (${kb(html.length)} KiB)`);
ok(htmlGzip.length<300_000,`canonical application HTML gzip budget exceeded (${kb(htmlGzip.length)} KiB)`);
ok(deployedHtml.length<170_000,`deployed application HTML budget exceeded (${kb(deployedHtml.length)} KiB)`);
ok(deployedHtmlGzip.length<300_000,`deployed application HTML gzip budget exceeded (${kb(deployedHtmlGzip.length)} KiB)`);
ok(workspaceRuntime.length<550_000,`workspace runtime budget exceeded (${kb(workspaceRuntime.length)} KiB)`);
ok(workspaceStyles.length<220_000,`workspace stylesheet budget exceeded (${kb(workspaceStyles.length)} KiB)`);
ok(workspaceViews.length<180_000,`workspace lazy-view bundle budget exceeded (${kb(workspaceViews.length)} KiB)`);
ok(workspaceViewShardPayloads.length===12,"workspace view shard count mismatch");
const shardedIds=[];
for(let i=0;i<workspaceViewShardPayloads.length;i++){
  const payload=workspaceViewShardPayloads[i];
  ok(payload.schema===2&&payload.shard===i&&payload.views&&typeof payload.views==="object",`workspace view shard schema mismatch (${i})`);
  for(const [id,markup] of Object.entries(payload.views)){
    ok(workspaceViewShardFor(id)===i,`workspace view routed to wrong shard (${id})`);
    ok(workspaceViewsPayload.views[id]===markup,`workspace view shard drift (${id})`);
    shardedIds.push(id);
  }
}
ok(new Set(shardedIds).size===lazyViewIds.length&&shardedIds.length===lazyViewIds.length,"workspace view shards must cover each lazy view exactly once");
const maxWorkspaceViewShard=Math.max(...workspaceViewShards.map(buffer=>buffer.length));
ok(maxWorkspaceViewShard<32_000,`workspace lazy-view shard budget exceeded (${kb(maxWorkspaceViewShard)} KiB)`);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p]});
const staticFiles=walk(path.join(root,"public")).filter(p=>!p.endsWith(`${path.sep}_headers`)&&!p.endsWith(`${path.sep}.assetsignore`));
ok(staticFiles.length<2_000,`static asset count safety budget exceeded (${staticFiles.length})`);
const largest=staticFiles.reduce((best,p)=>fs.statSync(p).size>best.size?{p,size:fs.statSync(p).size}:best,{p:"",size:0});
ok(largest.size<10*1024*1024,`single static asset safety budget exceeded (${path.relative(root,largest.p)} ${kb(largest.size)} KiB)`);
const total=staticFiles.reduce((n,p)=>n+fs.statSync(p).size,0);ok(total<20*1024*1024,`total public asset safety budget exceeded (${kb(total)} KiB)`);
console.log(`Bundle budget: ${checks}/${checks} PASS · worker ${kb(worker.length)} KiB raw/${kb(workerGzip.length)} KiB gzip · canonical HTML ${kb(html.length)} KiB · deployed HTML ${kb(deployedHtml.length)} KiB raw/${kb(deployedHtmlGzip.length)} KiB gzip · workspace runtime ${kb(workspaceRuntime.length)} KiB · workspace styles ${kb(workspaceStyles.length)} KiB · lazy views ${kb(workspaceViews.length)} KiB canonical / max shard ${kb(maxWorkspaceViewShard)} KiB · ${staticFiles.length} public files`);
