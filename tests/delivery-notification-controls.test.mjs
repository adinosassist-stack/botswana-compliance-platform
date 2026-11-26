import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/delivery-reminders-manager.js',import.meta.url),'utf8');
// A minimal DOM collaborator exercises actual production event handlers. It
// deliberately makes no layout claims; Chromium acceptance covers geometry.
function fixture({mobile=false,storage=new Map()}={}){
 let document;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.hidden=false;this.disabled=false;this._text='';this.style={setProperty:(k,v)=>{this.style[k]=v},removeProperty:k=>{delete this.style[k]}};this.classList={toggle:()=>{}}}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
  prepend(node){node.parent=this;this.children.unshift(node)}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes)}
  set textContent(text){this.children=[];this._text=String(text)}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('')}
  setAttribute(k,v){this.attributes[k]=String(v)}
  getAttribute(k){return this.attributes[k]??null}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
  emit(k,event={}){for(const fn of this.listeners[k]||[])fn(event)}
  click(){if(!this.disabled)this.emit('click')}
  focus(){document.activeElement=this}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  setPointerCapture(){}
  getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()]}
  getBoundingClientRect(){const left=parseFloat(this.style.left)||20,top=parseFloat(this.style.top)||30;return {left,top,width:44,height:44,right:left+44,bottom:top+44}}
  querySelectorAll(selector){
   const match=node=>{
    const tag=selector.match(/^\w+/)?.[0];if(tag&&node.tagName!==tag)return false;
    const cls=selector.match(/\.([\w-]+)/)?.[1];if(cls&&!node.className.split(' ').includes(cls))return false;
    if(selector.includes(':not([disabled])')&&node.disabled)return false;
    if(selector.includes('[aria-pressed]')&&!('aria-pressed' in node.attributes))return false;
    return true;
   };
   return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(selector)]);
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 }
 const body=new Element('body');
 const find=(node,id)=>node.id===id?node:node.children.map(n=>find(n,id)).find(Boolean);
 document={body,createElement:tag=>new Element(tag),getElementById:id=>find(body,id),addEventListener:()=>{},hidden:false};
 const company=new Element('select');company.id='companySelect';company.value='company-A';body.append(company);
 const reports=new Element('main');reports.id='dailyreports';body.append(reports);
 const events={};const user={id:'owner-A',tenantId:'tenant-A'};
 const window={currentUser:user,innerWidth:mobile?390:1280,innerHeight:800,matchMedia:()=>({matches:mobile}),addEventListener:(k,fn)=>events[k]=fn};
 const context=vm.createContext({window,document,crypto:webcrypto,TextEncoder,Intl,Date,queueMicrotask,setTimeout:()=>{},setInterval:()=>{},requestAnimationFrame:fn=>fn(),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`globalThis.h={render,restore:async items=>restoreReadReminders(items,reminderScope(),loadEpoch),positionBell,enableBellDrag,sync:()=>syncBellLayout()};})();`),context);
 return {h:context.h,document,window,user,storage,events,Element,get:id=>document.getElementById(id)};
}
const job=(id,daysUntil)=>({sourceReportId:'r'+id,locationId:'branch',employeeId:'worker',jobType:'installation',jobReference:'TEST-'+id,scheduledDate:'2026-11-27',locationName:'Sample branch',daysUntil});

test('approved centre groups overdue/today before upcoming and exposes usable filters',()=>{
 const f=fixture();f.h.render([job(1,3),job(2,-2),job(3,0)]);
 const list=f.get('thebeDeliveryList');
 assert.deepEqual(list.children.filter(x=>x.tagName==='h3').map(x=>x.textContent),['Needs attention','Upcoming']);
 assert.deepEqual(list.querySelectorAll('article').map(x=>x.dataset.reminderKey.includes('TEST-2')), [true,false,false]);
 assert.equal(f.get('thebeDeliveryCount').textContent,'3');
 assert.equal(f.get('thebeDeliveryUnread').getAttribute('aria-pressed'),'true');
 assert.match(list.textContent,/2 days overdue/);
});
test('mark one removes only that unread item; All exposes its saved read state',async()=>{
 const f=fixture();const items=[job(1,-1),job(2,1)];await f.h.restore(items);f.h.render(items);
 f.get('thebeDeliveryList').querySelector('.thebe-delivery-mark-read').click();
 assert.equal(f.get('thebeDeliveryCount').textContent,'1');
 assert.equal(f.get('thebeDeliveryList').querySelectorAll('article').length,1);
 assert.match(f.get('thebeDeliveryActionStatus').textContent,/Saved as read/);
 f.get('thebeDeliveryAll').click();
 const reads=f.get('thebeDeliveryList').querySelectorAll('.thebe-delivery-mark-read');
 assert.equal(reads.length,2);assert(reads[0].disabled);assert.equal(reads[0].textContent,'✓ Read');
 assert(items.every(x=>x.daysUntil!==undefined&&!('jobStatus' in x)));
});
test('mark all includes reminders outside the first twelve and supports a fresh session',async()=>{
 const f=fixture();const items=Array.from({length:15},(_,i)=>job(i,i%3));await f.h.restore(items);f.h.render(items);
 assert.equal(f.get('thebeDeliveryList').querySelectorAll('article').length,12);
 f.get('thebeDeliveryMarkAll').click();
 assert.equal(f.get('thebeDeliveryCount').textContent,'0');assert(f.get('thebeDeliveryMarkAll').disabled);
 assert.match(f.get('thebeDeliveryList').textContent,/No unread/);
 const fresh=fixture({storage:f.storage});await fresh.h.restore(items);fresh.h.render(items);
 assert.equal(fresh.get('thebeDeliveryCount').textContent,'0');
 fresh.get('thebeDeliveryAll').click();assert.equal(fresh.get('thebeDeliveryList').querySelectorAll('article').length,12);
});
test('a stale account action cannot acknowledge reminders or write storage',async()=>{
 const f=fixture();const items=[job(1,-1)];await f.h.restore(items);f.h.render(items);
 const old=f.get('thebeDeliveryMarkAll');f.user.id='another-owner';old.click();
 assert.equal(f.storage.size,0);assert(f.get('thebeDeliveryManagerBell').hidden);
});
for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} pill drag persists, suppresses drag-click, supports tap, resize and keyboard reset`,()=>{
 const f=fixture({mobile});f.h.render([job(1,1)]);const bell=f.get('thebeDeliveryManagerBell');
 const down={isPrimary:true,button:0,pointerId:1,clientX:30,clientY:40};
 bell.emit('pointerdown',down);bell.emit('pointermove',{pointerId:1,clientX:230,clientY:240});bell.emit('pointerup',{pointerId:1});
 assert(f.storage.has('thebe.delivery.bell.position.v2'));
 let prevented=false; // The capture listener must suppress the following synthetic click.
 bell.listeners.click.at(-1)({preventDefault:()=>prevented=true,stopImmediatePropagation:()=>{}});assert(prevented);
 f.get('thebeDeliveryManagerPopup').hidden=true;bell.click();assert.equal(f.get('thebeDeliveryManagerPopup').hidden,false);
 const fresh=fixture({mobile,storage:f.storage});fresh.h.render([job(1,1)]);
 assert.equal(fresh.get('thebeDeliveryManagerBell').style.left,bell.style.left);
 f.window.innerWidth=180;f.window.innerHeight=300;f.h.sync();
 assert(parseFloat(bell.style.left)<=128);assert(parseFloat(bell.style.top)<=300-44-(mobile?104:8));
 bell.emit('keydown',{altKey:true,key:'Home',preventDefault:()=>{}});assert(!f.storage.has('thebe.delivery.bell.position.v2'));
});
test('pill drag cancellation restores its starting position without persisting',()=>{
 const f=fixture({mobile:true});f.h.render([job(1,1)]);const bell=f.get('thebeDeliveryManagerBell'),start=bell.getBoundingClientRect();
 bell.emit('pointerdown',{isPrimary:true,button:0,pointerId:1,clientX:30,clientY:40});
 bell.emit('pointermove',{pointerId:1,clientX:200,clientY:200});bell.emit('pointercancel',{pointerId:1});
 assert.equal(bell.getBoundingClientRect().left,start.left);assert.equal(bell.getBoundingClientRect().top,start.top);
 assert(!f.storage.has('thebe.delivery.bell.position.v2'));
});
test('notification pill avoids the visible AI pill',()=>{
 const f=fixture({mobile:true});const ai=new f.Element('div');ai.id='thebeAiDockPill';ai.style.left='100px';ai.style.top='100px';f.document.body.append(ai);
 const bell=new f.Element('button');const p=f.h.positionBell(bell,100,100),a=ai.getBoundingClientRect();
 assert(p.x+44<=a.left-12||p.x>=a.right+12||p.y+44<=a.top-12||p.y>=a.bottom+12);
});
