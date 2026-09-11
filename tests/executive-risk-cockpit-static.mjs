import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const checks=[
 ['hero copy',html.includes('See business risk before it becomes a penalty, dispute or loss.')],
 ['legacy hero removed',!html.includes('See business risk before it becomes a penalty, dispute or lost tender.')],
 ['circular gauge component',html.includes('class="metric-ring ring-blue"')&&html.includes('data-ring-target="complianceScore"')],
 ['protection circular gauge',html.includes('data-ring-target="protectionScore"')],
 ['evidence circular gauge',html.includes('data-ring-target="evidenceCoverage"')],
 ['area circular health',html.includes('area-mini-ring')&&html.includes('area-health-row')],
 ['ring synchronization',html.includes('function syncMetricRing')&&html.includes('MutationObserver')],
 ['larger small text',html.includes('--text-small:13.5px')],
 ['larger navigation text',html.includes('.nav button{font-size:13.5px!important')],
 ['existing metric ids preserved',html.includes('id="complianceScore"')&&html.includes('id="protectionScore"')&&html.includes('id="openActions"')&&html.includes('id="evidenceCoverage"')]
];
let failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length)process.exit(1);
