import fs from 'node:fs';

const jsPath='public/js/owner-command-centre.js';
const indexPath='public/index.html';
const functionsPath='scripts/agentic-owner-centre-functions.fragment';
const shellPath='scripts/agentic-owner-centre-shell.fragment';
const stylesPath='scripts/agentic-owner-centre-styles.fragment';
let js=fs.readFileSync(jsPath,'utf8');
let html=fs.readFileSync(indexPath,'utf8');
const agenticFunctions=fs.readFileSync(functionsPath,'utf8');
const shellInsert=fs.readFileSync(shellPath,'utf8');
const css=fs.readFileSync(stylesPath,'utf8');

function replaceOnce(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(needle,replacement);
}

js=replaceOnce(js,'const RELEASE="20260913b";','const RELEASE="20260913c";','browser release');
js=replaceOnce(
  js,
  '  let stateWriteQueue=Promise.resolve();\n',
  '  let stateWriteQueue=Promise.resolve();\n  let agenticLatestPlan=null;\n  let agenticBusy=false;\n',
  'agentic state'
);
js=replaceOnce(js,'  function createShell(){',agenticFunctions+'  function createShell(){','agentic functions');
js=replaceOnce(js,'    shell.append(grid);\n\n    const salesDetails=','    shell.append(grid);\n\n'+shellInsert+'    const salesDetails=','agentic shell');
js=replaceOnce(js,'      renderInputs(inputs);\n','      renderInputs(inputs);\n      await renderAgenticGovernance();\n','agentic render');
js=replaceOnce(
  js,
  '    openSales:openSalesWorkspace\n',
  '    openSales:openSalesWorkspace,\n    refreshAgentic:()=>renderAgenticGovernance(true),\n    generatePlan:generateAgenticPlan\n',
  'owner command exports'
);

html=html.replace(/owner-command-centre\.js\?v=[^"']+/g,'owner-command-centre.js?v=20260913c');
if(!html.includes('ownerAgenticStyles')){
  const headClose=html.indexOf('</head>');
  if(headClose<0)throw new Error('agentic style: no head close found');
  html=html.slice(0,headClose)+css+html.slice(headClose);
}

fs.writeFileSync(jsPath,js);
fs.writeFileSync(indexPath,html);
console.log('Agentic Owner Command Centre patch applied.');
