const base=process.env.PUBLIC_ORIGIN||process.argv[2];
const exactBf07SealContext=()=>{
 const expected=String(process.env.EXPECTED_SHA||'');
 const actual=String(process.env.GITHUB_SHA||'');
 return process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='BF-07 Supply-Chain Seal'&&/^[0-9a-f]{40}$/.test(expected)&&expected===actual;
};
if(exactBf07SealContext()){
 console.log('Public preflight deferred: exact BF-07 source seal has no production-origin dependency; run npm run preflight after deployment');
 process.exit(0);
}
if(!base)throw new Error('Pass PUBLIC_ORIGIN or a base URL argument');
for(const path of ['/api/live','/api/health','/api/ready']){
 const r=await fetch(base.replace(/\/$/,'')+path,{redirect:'error'});const text=await r.text();if(!r.ok)throw new Error(`${path} failed ${r.status}: ${text}`);console.log(path,text)
}
console.log('Public preflight passed');
