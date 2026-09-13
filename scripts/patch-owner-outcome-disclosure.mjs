import fs from 'node:fs';

const path='public/js/owner-command-centre.js';
let source=fs.readFileSync(path,'utf8');
source=source.replace('const RELEASE="20260913c";','const RELEASE="20260913d";');
const anchor=`    body.append(boundary);\n\n    const latestRun=agenticLatestPlan?.run||(Array.isArray(runsPayload?.items)?runsPayload.items[0]:null);`;
const replacement=`    body.append(boundary);\n\n    if(statusPayload?.outcomeLearning?.enabled){\n      const learning=document.createElement("div");\n      learning.className="owner-agentic-boundary";\n      learning.append(\n        text("span","Outcome-informed ordering","badge"),\n        text("span","Recent recorded outcomes can only reorder recommendations within the same priority level. This is non-causal and cannot change risk, approvals or execution authority.")\n      );\n      body.append(learning);\n    }\n\n    const latestRun=agenticLatestPlan?.run||(Array.isArray(runsPayload?.items)?runsPayload.items[0]:null);`;
if(source.includes('Outcome-informed ordering')){
  console.log('Owner Centre disclosure already present');
  process.exit(0);
}
if(!source.includes(anchor))throw new Error('Owner Centre disclosure anchor missing');
source=source.replace(anchor,replacement);
fs.writeFileSync(path,source);
console.log('Owner Centre outcome-learning disclosure patched');
