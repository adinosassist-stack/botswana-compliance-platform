import fs from 'node:fs';
const fixtureIds=new Set(JSON.parse(fs.readFileSync(new URL('./fixtures.json',import.meta.url),'utf8')).map(x=>x.id));
const file=process.argv[2];if(!file)throw Error('Pass a results JSON path');
const {runs}=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(runs)||!runs.length)throw Error('Missing runs');
const models=new Map();for(const r of runs){
 if(!fixtureIds.has(r.fixture)||typeof r.model!=='string'||!r.model)throw Error('Invalid fixture/model');
 for(const k of ['latencyMs','inputTokens','outputTokens','inputPricePerMillionUsd','outputPricePerMillionUsd'])if(!Number.isFinite(r[k])||r[k]<0)throw Error('Invalid '+k);
 if(typeof r.success!=='boolean'||typeof r.denialCorrect!=='boolean')throw Error('Missing verdict');
 const a=models.get(r.model)||[];a.push(r);models.set(r.model,a);
}
const quantile=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.ceil(q*s.length)-1]};
if(models.size<2)throw Error('At least two models required');
const out=[];for(const [model,a] of models){for(const id of fixtureIds)if(!a.some(x=>x.fixture===id))throw Error(model+' missing '+id);
 const cost=a.reduce((s,r)=>s+(r.inputTokens*r.inputPricePerMillionUsd+r.outputTokens*r.outputPricePerMillionUsd)/1e6,0);
 const successes=a.filter(r=>r.success).length;const security=a.filter(r=>r.fixture.endsWith('-denial'));
 if(security.some(r=>!r.denialCorrect))throw Error(model+' failed a security denial; refuse ranking');
 out.push({model,observations:a.length,successRate:successes/a.length,securityDenialRate:security.filter(r=>r.denialCorrect).length/security.length,p50Ms:quantile(a.map(r=>r.latencyMs),.5),p95Ms:quantile(a.map(r=>r.latencyMs),.95),totalUsd:cost,costPerSuccessUsd:successes?cost/successes:null});
}
process.stdout.write(JSON.stringify({warning:'Measured results only; no automatic provider recommendation',models:out},null,2)+'\n');
