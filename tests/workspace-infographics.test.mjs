import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const runtime=readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=runtime.indexOf('function renderWorkspaceInfographic('),end=runtime.indexOf('async function renderWorkHub(',start);
const helper=runtime.slice(start,end);
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fixture(){const mount={safeHTML:''};const draw=vm.runInNewContext(helper+'\nrenderWorkspaceInfographic',{document:{getElementById:()=>mount},escapeHtml});return {mount,draw}}
test('proportions show exact counts, direct labels and native navigation buttons',()=>{
 const {mount,draw}=fixture();draw('x','Work',[{label:'Overdue',count:3,view:'obligations'},{label:'Later',count:1,view:'obligations'}],'Recorded only');
 assert.match(mount.safeHTML,/4 records/);assert.match(mount.safeHTML,/width:75%/);assert.match(mount.safeHTML,/width:25%/);assert.match(mount.safeHTML,/>Overdue<\/span><b>3<\/b>/);assert.match(mount.safeHTML,/type="button"/);assert.match(mount.safeHTML,/showView\('obligations'\)/);
});
test('zero is an empty state while unavailable clears prior graphic',()=>{
 const {mount,draw}=fixture();draw('x','Proof',[{label:'Verified',count:0,view:'vault'}],'Stored only');assert.match(mount.safeHTML,/No records yet/);assert.doesNotMatch(mount.safeHTML,/NaN|Infinity/);
 draw('x','',null,'Unavailable');assert.match(mount.safeHTML,/role="status">Unavailable/);assert.doesNotMatch(mount.safeHTML,/workspace-info-track/);
});
test('titles, labels and notes escape markup',()=>{
 const {mount,draw}=fixture();draw('x','<img>',[{label:'<script>',count:1,view:'vault'}],'<iframe>');assert.doesNotMatch(mount.safeHTML,/<img>|<script>|<iframe>/);assert.match(mount.safeHTML,/&lt;script&gt;/);
});
test('work buckets partition open actions, including overdue and missing dates',async()=>{
 const mount={safeHTML:''};const now=Date.now();
 const code=runtime.slice(runtime.indexOf('async function renderWorkHub('),runtime.indexOf('async function renderTenderHub('));
 const draw=vm.runInNewContext(helper+code+'\nrenderWorkHub',{document:{getElementById:id=>id==='workInfographic'?mount:null,querySelectorAll:()=>[]},escapeHtml,roleCanView:()=>true,currentWorkspaceRole:()=> 'employee',apiJson:async path=>path==='/api/obligations'?{items:[{status:'open',due_at:new Date(now-86400000).toISOString()},{status:'open',due_at:new Date(now+86400000).toISOString()},{status:'open',due_at:new Date(now+60*86400000).toISOString()},{status:'open',due_at:'invalid'},{status:'completed'}]}:{},Date});
 await draw();assert.match(mount.safeHTML,/4 records/);assert.equal((mount.safeHTML.match(/<b>1<\/b>/g)||[]).length,4);assert.match(mount.safeHTML,/No valid due date/);
});
test('canonical runtime parity and loading/error reset are retained',()=>{
 assert.ok(html.includes(helper));assert.match(runtime,/renderWorkspaceInfographic\("proofInfographic","",null,"Evidence status unavailable/);assert.match(runtime,/renderWorkspaceInfographic\("workInfographic","",null,"Workload unavailable/);assert.match(html,/workspace-infographics.css/);
});

test('infographic surface uses explicit matching light-theme colours',()=>{
 const css=readFileSync(new URL('../public/assets/workspace-infographics.css',import.meta.url),'utf8');
 assert.match(css,/background:#fff;color:#18375a/);
 assert.doesNotMatch(css,/var\(--panel|var\(--text|var\(--muted/);
});
