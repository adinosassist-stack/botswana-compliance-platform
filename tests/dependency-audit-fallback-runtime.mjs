import assert from 'node:assert/strict';
import {auditLockedComponentsWithGitHub,buildAffectChunks,classifyNpmAudit,fallbackAuditReport,productionLockedComponents} from '../scripts/dependency-audit.mjs';

assert.equal(classifyNpmAudit({status:0,stdout:'{"metadata":{"vulnerabilities":{}},"vulnerabilities":{}}',stderr:''}).kind,'pass');
assert.equal(classifyNpmAudit({status:0,stdout:'{}',stderr:''}).kind,'infrastructure');
assert.equal(classifyNpmAudit({
  status:1,
  stdout:'{"metadata":{"vulnerabilities":{"high":1}},"vulnerabilities":{"x":{"severity":"high"}}}',
  stderr:''
}).kind,'vulnerabilities');
assert.equal(classifyNpmAudit({status:1,stdout:'{"error":{"code":"E400"}}',stderr:'audit endpoint returned an error'}).kind,'infrastructure');

const productionComponents=productionLockedComponents({
  packages:{
    '':{name:'test-app',version:'1.0.0'},
    'node_modules/express':{version:'5.1.0'},
    'node_modules/sharp':{version:'0.35.2',dev:true},
    'node_modules/shared':{version:'2.0.0',dev:true},
    'node_modules/a/node_modules/shared':{version:'2.0.0'}
  }
});
assert.deepEqual(productionComponents,[
  {name:'express',version:'5.1.0'},
  {name:'shared',version:'2.0.0'}
],'production fallback must exclude dev-only lock entries but retain a package/version that also has a production occurrence');

const components=[
  {name:'express',version:'5.1.0'},
  {name:'@aws-sdk/client-s3',version:'3.1126.0'},
  {name:'express',version:'5.1.0'}
];
const chunks=buildAffectChunks(components,80);
assert.ok(chunks.length>=1);
assert.deepEqual([...new Set(chunks.flat())].sort(),['@aws-sdk/client-s3@3.1126.0','express@5.1.0'].sort());

const seen=[];
const emptyFetch=async raw=>{
  const url=new URL(raw);seen.push(url);
  return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
};
const clean=await auditLockedComponentsWithGitHub({components,fetchImpl:emptyFetch,token:'test-token'});
assert.equal(clean.checked,components.length);
assert.equal(clean.advisories.length,0);
assert.ok(seen.some(url=>url.searchParams.get('type')==='reviewed'&&url.searchParams.get('severity')==='high'));
assert.ok(seen.some(url=>url.searchParams.get('type')==='reviewed'&&url.searchParams.get('severity')==='critical'));
assert.ok(seen.some(url=>url.searchParams.get('type')==='malware'&&!url.searchParams.get('severity')));
assert.ok(seen.every(url=>url.searchParams.get('ecosystem')==='npm'));
assert.ok(seen.some(url=>url.searchParams.get('affects')?.includes('express@5.1.0')));

const advisory={
  ghsa_id:'GHSA-test-test-test',
  html_url:'https://github.com/advisories/GHSA-test-test-test',
  severity:'high',
  type:'reviewed'
};
const vulnerableFetch=async raw=>{
  const url=new URL(raw);
  const body=url.searchParams.get('type')==='reviewed'&&url.searchParams.get('severity')==='high'?[advisory]:[];
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
};
const vulnerable=await auditLockedComponentsWithGitHub({components,fetchImpl:vulnerableFetch});
assert.equal(vulnerable.advisories.length,1);
assert.equal(vulnerable.advisories[0].ghsa_id,advisory.ghsa_id);

await assert.rejects(
  auditLockedComponentsWithGitHub({
    components,
    fetchImpl:async()=>new Response('maintenance',{status:503,headers:{'content-type':'text/plain'}})
  }),
  /GitHub advisory API 503/
);

console.log('Dependency audit fallback runtime: PASS');

const cleanEvidence=fallbackAuditReport({components,advisories:[]});
assert.equal(cleanEvidence.metadata.vulnerabilities.high,0);
assert.equal(cleanEvidence.metadata.vulnerabilities.critical,0);
assert.equal(cleanEvidence.metadata.dependencies.prod,components.length);
const malwareEvidence=fallbackAuditReport({components,advisories:[{ghsa_id:'GHSA-malware-test',type:'malware',html_url:'https://github.com/advisories/GHSA-malware-test'}]});
assert.equal(malwareEvidence.metadata.vulnerabilities.critical,1,'malware must block BF-07 as critical fallback evidence');
