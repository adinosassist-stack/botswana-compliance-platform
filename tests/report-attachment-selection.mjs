import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  children=[];listeners={};disabled=false;hidden=false;value='';checked=false;files=[];textContent='';
  classList={toggle(){}};
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);}
  replaceChildren(){this.children=[];}
  setAttribute(){}
  querySelectorAll(){return this.children.flatMap(row=>row.children.filter(child=>child.textContent==='Remove'));}
  getContext(){return null;}
}
const elements=new Map(),events={},windowEvents={},requests=[],revoked=[];
const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
let releasePhoto,releaseUpload;
const photoReady=new Promise(resolve=>{releasePhoto=resolve});
const uploadReady=new Promise(resolve=>{releaseUpload=resolve});
const client={async request(path,options){
  requests.push({path,options});
  if(path.endsWith('/submit'))return {reportId:'report-1',attachmentUploadGrant:'grant'};
  if(path.endsWith('/attachments')){await uploadReady;return {attachmentsAdded:3};}
  return {};
}};
const context={File,URL:{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL:url=>revoked.push(url)},
  document:{getElementById:el,createElement:()=>new Element(),addEventListener:(name,fn)=>{events[name]=fn}},
  window:{addEventListener:(name,fn)=>{windowEvents[name]=fn},dispatchEvent(){},scrollTo(){}},
  location:{hash:''},navigator:{onLine:true},BW:{api:{createClient:()=>client}},
  createImageBitmap:async()=>{await photoReady;return {width:100,height:100,close(){}}},
  CustomEvent:class {},btoa:value=>Buffer.from(value,'binary').toString('base64')};
vm.runInNewContext(fs.readFileSync(process.argv[2]||'public/js/employee-reporting-portal.js','utf8'),context);
events.DOMContentLoaded();
const image=new File([new Uint8Array([255,216,255,0])],'camera.jpg',{type:'image/jpeg'});
const pdf=name=>new File(['%PDF-test'],name,{type:'application/pdf'});
async function select(id,files){const input=el(id);input.files=files;return input.listeners.change({currentTarget:input});}
const selectingPhoto=select('reportCameraInput',[image]);
const selectingFiles=select('reportFileInput',[pdf('a.pdf'),pdf('b.pdf'),pdf('c.pdf')]);
assert.equal(el('reporterSubmitBtn').disabled,true,'send waits for camera processing');
el('reporterWorkSummary').value='Work completed';
await el('reporterDailyForm').listeners.submit({preventDefault(){}});
assert.equal(requests.length,0,'preparation must never silently omit a selected photo');
releasePhoto();await Promise.all([selectingPhoto,selectingFiles]);
assert.equal(el('reportAttachmentList').children.length,3,'overlapping camera/file selections respect the three-file limit');
assert.equal(el('reporterSubmitBtn').disabled,false);
assert.equal(el('reportFileInput').value,'');
windowEvents.pagehide({persisted:true});
assert.equal(revoked.length,0,'back-forward navigation keeps selected photo previews valid');
const sending=el('reporterDailyForm').listeners.submit({preventDefault(){}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('reportCameraInput').disabled,true,'camera is locked while sending');
assert.equal(el('reportFileInput').disabled,true,'file selection is locked while sending');
const remove=el('reportAttachmentList').children[0].children[2];
remove.listeners.click();
assert.equal(el('reportAttachmentList').children.length,3,'in-flight files cannot be removed before acknowledgement');
await select('reportFileInput',[pdf('late.pdf')]);
assert.equal(el('reportAttachmentList').children.length,3);
const upload=requests.find(item=>item.path.endsWith('/attachments'));
assert.equal(JSON.parse(upload.options.body).attachments.length,3,'exact selected files reach the upload request');
releaseUpload();await sending;
assert.equal(el('reportAttachmentList').children.length,0,'acknowledged uploads clear selected files');
assert.equal(el('reporterSubmitBtn').disabled,false);
assert.equal(el('reportFileInput').disabled,false);
console.log('Report attachment selection: camera preparation, concurrent limits, submit locking, bfcache and acknowledged cleanup PASS');
