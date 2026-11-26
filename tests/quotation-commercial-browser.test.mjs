import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import * as pdfLib from 'pdf-lib';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {handleQuotationCommercialRequest} from '../cloudflare/src/quotation-commercial-workflow.js';
import {createQuotationCommercialPdfRenderer} from '../server/quotation-commercial-pdf-renderer.mjs';
const {chromium}=createRequire(join(process.env.QUOTATION_BROWSER_ENGINE_ROOT||'/opt/codex/cua_node/lib','commercial-test.cjs'))('playwright');
let mf,db,browser,server,url,env;
const actor={tenant_id:'a',user_id:'owner',role:'owner',csrf_token:'test-csrf-token-1234'};
const html=`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import {mountQuotationCommercialWorkspace} from '/js/quotation-commercial-workspace.mjs';
try{window.editor=await mountQuotationCommercialWorkspace(document.querySelector('#root'),{capability:{enabled:true,authenticated:true,canEditQuotations:true,canCustomizeQuotationPreview:true,canPrepareCustomerQuotation:true}});window.ready=true}catch(e){window.failed=e.message}
</script></html>`;
test.before(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.QUOTATION_CHROMIUM_EXECUTABLE?{executablePath:process.env.QUOTATION_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('test')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'commercial-browser'}}));db=await mf.getD1Database('DB');
 await db.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY); INSERT INTO tenants VALUES('a'); CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner'); CREATE TABLE finance_transactions(id TEXT PRIMARY KEY,tenant_id TEXT,amount_minor INTEGER);");
 for(const sql of splitSqliteMigrationStatements(await readFile('cloudflare/migrations/049_v108_finance_receivables.sql','utf8')))await db.prepare(sql).run();
 await db.exec("INSERT INTO finance_customers(id,tenant_id,status,name) VALUES('ca','a','active','Customer A');");
 for(const sql of splitSqliteMigrationStatements(await readFile('docs/sql/quotation-commercial-workflow-CANDIDATE.sql','utf8')))await db.prepare(sql).run();
 env={DB:db,QUOTATION_COMMERCIAL_ENABLED:'true',QUOTATION_PDF_RENDERER:createQuotationCommercialPdfRenderer({browser,pdfLib})};
 server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/'){res.setHeader('content-type','text/html');res.end(html);return}
  if(/^\/js\/[a-z0-9-]+\.mjs$/.test(path)){res.setHeader('content-type','text/javascript');res.end(await readFile('public'+path));return}
  if(path==='/api/auth/me'){res.setHeader('content-type','application/json');res.end(JSON.stringify({csrfToken:actor.csrf_token}));return}
  if(path==='/api/finance/customers'){res.setHeader('content-type','application/json');res.end(JSON.stringify({items:[{id:'ca',name:'Customer A',status:'active'}]}));return}
  const chunks=[];for await(const c of req)chunks.push(c);const data=Buffer.concat(chunks);
  const request=new Request(url+req.url,{method:req.method,headers:req.headers,...(data.length?{body:data}:{})});
  const response=await handleQuotationCommercialRequest({request,env,auth:actor});
  if(!response){res.writeHead(404);res.end();return}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message)}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));url='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{await new Promise(ok=>server?.close(ok));await browser?.close();await mf?.dispose()});
async function ready(page){await page.goto(url);await page.waitForFunction(()=>window.ready||window.failed);assert.equal(await page.evaluate(()=>window.failed),undefined)}
function field(page,text){return page.getByLabel(text,{exact:true})}
test('mobile company defaults, save/reload across browser sessions, issue, direct two-page PDF, download and native share',async()=>{
 const context=await browser.newContext({viewport:{width:375,height:812},acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',e=>console.error('browser runtime:',e.message));page.on('dialog',dialog=>dialog.accept());await ready(page);
 await page.getByText('Company Settings — banking details',{exact:true}).click();
 for(const [title,value] of Object.entries({'Bank name':'FNB','Account holder':'Synthetic Company','Account number':'00123456789','Branch':'Riverwalk','Branch code (optional)':'123','Payment reference (optional)':'Quote number'}))await field(page,title).fill(value);
 await page.getByRole('button',{name:'Save company banking details',exact:true}).click();await page.getByRole('status').filter({hasText:'Company banking details saved'}).waitFor();
 await page.getByRole('button',{name:'New quotation',exact:true}).click();await page.getByRole('status').filter({hasText:'New quotation.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Export draft JSON',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Choose saved PDF to share',exact:true}).count(),0);
 assert.equal(await page.getByText('Invoice drafting and issuance are not available from this editor.',{exact:false}).count(),0);
 await field(page,'Customer name').fill('Customer A');await field(page,'Customer number').fill('+267 71234567');await field(page,'Installation/location').fill('Mahalapye');await page.getByRole('textbox',{name:'Price 1',exact:true}).fill('14000.00');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved to your business account'}).waitFor();
 const savedId=await page.getByRole('combobox',{name:'Saved quotations and invoices'}).inputValue();assert.ok(savedId);
 // A new context models another signed-in session/device with no shared web storage.
 const second=await browser.newContext({viewport:{width:320,height:740}});const other=await second.newPage();other.on('pageerror',e=>console.error('browser runtime:',e.message));other.on('dialog',d=>d.accept());await ready(other);
 assert.equal(await other.locator('.qc-bank input[type=password]').inputValue(),'00123456789');
 await other.getByRole('combobox',{name:'Saved quotations and invoices'}).selectOption(savedId);await other.getByRole('button',{name:'Open saved',exact:true}).click();await other.getByRole('status').filter({hasText:'Saved quote opened'}).waitFor();
 assert.equal(await field(other,'Customer name').inputValue(),'Customer A');
 await other.getByRole('button',{name:'Issue document',exact:true}).click();await other.getByRole('status').filter({hasText:'Issued QT-000001'}).waitFor();
 assert.equal(await other.getByRole('button',{name:'Save draft',exact:true}).isDisabled(),true);
 await other.getByRole('button',{name:'Prepare PDF',exact:true}).click();await other.getByRole('status').filter({hasText:'PDF ready.'}).waitFor({timeout:30000});
 const downloadWait=other.waitForEvent('download');await other.getByRole('button',{name:'Download PDF',exact:true}).click();const download=await downloadWait;assert.equal(download.suggestedFilename(),'QT-000001.pdf');
 const response=await other.request.get(url+'/api/quotation/documents/'+savedId+'/pdf');assert.equal(response.status(),200);const pdf=await pdfLib.PDFDocument.load(await response.body());assert.equal(pdf.getPageCount(),2);
 await other.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:payload=>{window.shareEvidence={name:payload.files[0].name,type:payload.files[0].type,size:payload.files[0].size,activation:navigator.userActivation.isActive,keys:Object.keys(payload)};return Promise.resolve()}})});
 await other.getByRole('button',{name:'Share PDF',exact:true}).click();const share=await other.evaluate(()=>window.shareEvidence);assert.equal(share.name,'QT-000001.pdf');assert.equal(share.type,'application/pdf');assert.ok(share.size>1000);assert.equal(share.activation,true);assert.deepEqual(share.keys,['files']);
 await other.getByRole('combobox',{name:'Invoice customer',exact:true}).selectOption('ca');await other.getByLabel('Invoice due date',{exact:true}).fill('2026-12-30');
 await other.getByRole('button',{name:'Create invoice draft',exact:true}).click();await other.getByRole('status').filter({hasText:'Invoice draft created'}).waitFor();
 await other.getByRole('button',{name:'Issue document',exact:true}).click();await other.getByRole('status').filter({hasText:'Issued INV-000001'}).waitFor();
 assert.equal((await db.prepare('SELECT count(*) n FROM finance_invoices').first()).n,1);
 assert.ok(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await second.close();await context.close();
});

test('commercial controls reflow at mobile/tablet widths, landscape and 200-percent-equivalent widths',async()=>{
 for(const [width,height] of [[320,740],[375,812],[414,896],[430,932],[768,1024],[812,375],[640,900]]){
 const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();page.on('dialog',d=>d.accept());
 try{
  await ready(page);
  await page.getByRole('button',{name:'Open saved',exact:true}).click();await page.getByRole('status').filter({hasText:/Saved (quote|invoice) opened/}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width+'x'+height);
  for(const name of ['New quotation','Open saved','Prepare PDF','Company Settings — banking details']){
   const locator=name.startsWith('Company')?page.getByText(name,{exact:true}):page.getByRole('button',{name,exact:true});
   const box=await locator.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1,'clipped '+name+' at '+width);
  }
 }finally{await context.close()}
 }
 // 640/320 CSS-pixel widths are reflow proxies, not native browser zoom proof.
});
