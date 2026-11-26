import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/delivery-reminders-manager.js',import.meta.url),'utf8');
const item={sourceReportId:'private-report',locationId:'branch',employeeId:'employee',jobType:'installation',jobReference:'private-job',scheduledDate:'2026-11-27'};
function fixture(storage=new Map(),crypto=webcrypto){
 const company={value:'company-A'},user={id:'owner-A',tenantId:'tenant-A'};
 const context=vm.createContext({crypto,TextEncoder,window:{currentUser:user},document:{getElementById:()=>company},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
 // Exercise the production persistence functions with real Web Crypto and
 // independent browser-like storage; no test-only production exports.
 const prefix=source.slice(0,source.indexOf('function updateReminderCounts()'));
 vm.runInContext(prefix+`globalThis.harness={restore:async items=>restoreReadReminders(items,reminderScope(),loadEpoch),
  mark:item=>{readReminders.add(reminderKey(item));return saveReadReminder(item)},
  isRead:item=>readReminders.has(reminderKey(item)),reset:()=>{readReminders.clear();loadEpoch++}};})();`,context);
 return {h:context.harness,storage,user,company,context};
}
test('acknowledgements survive a fresh session without persisting job or account details',async()=>{
 const first=fixture();await first.h.restore([item]);assert.equal(first.h.isRead(item),false);
 assert.equal(first.h.mark(item),true);
 const next=fixture(first.storage);await next.h.restore([item]);assert.equal(next.h.isRead(item),true);
 const stored=JSON.stringify([...first.storage]);
 for(const value of ['private-report','private-job','owner-A','tenant-A','company-A','installation','2026-11-27'])assert(!stored.includes(value));
});
test('user, tenant and company each isolate the same reminder identity',async()=>{
 const f=fixture();await f.h.restore([item]);assert(f.h.mark(item));
 for(const [object,key,value] of [[f.user,'id','owner-B'],[f.user,'tenantId','tenant-B'],[f.company,'value','company-B']]){
  const previous=object[key];object[key]=value;f.h.reset();await f.h.restore([item]);assert.equal(f.h.isRead(item),false);
  object[key]=previous;f.h.reset();await f.h.restore([item]);assert.equal(f.h.isRead(item),true);
 }
});
test('rescheduling or a new source report needs a fresh acknowledgement',async()=>{
 const f=fixture();await f.h.restore([item]);assert(f.h.mark(item));
 for(const updated of [{...item,scheduledDate:'2026-11-28'},{...item,sourceReportId:'new-report'}]){
  f.h.reset();await f.h.restore([updated]);assert.equal(f.h.isRead(updated),false);
 }
});
test('missing identity and unavailable storage retain session-only reading',async()=>{
 const missing=fixture();missing.user.id='';await missing.h.restore([item]);assert.equal(missing.h.mark(item),false);assert(missing.h.isRead(item));assert.equal(missing.storage.size,0);
 const f=fixture();await f.h.restore([item]);
 f.context.localStorage.setItem=()=>{throw Error('quota')};assert.equal(f.h.mark(item),false);assert(f.h.isRead(item));
});
test('invalid cached data fails safely and writes remain bounded',async()=>{
 const f=fixture();await f.h.restore([item]);assert(f.h.mark(item));
 const key=[...f.storage.keys()][0];f.storage.set(key,'invalid JSON');f.h.reset();await f.h.restore([item]);assert.equal(f.h.isRead(item),false);assert.equal(f.h.mark(item),false);
 f.storage.set(key,JSON.stringify(Array.from({length:600},(_,i)=>i.toString(16).padStart(64,'0'))));
 f.h.reset();await f.h.restore([item]);assert(f.h.mark(item));assert.equal(JSON.parse(f.storage.get(key)).length,500);
});
test('a restore pending during an account change cannot install another account state',async()=>{
 let release;
 const gate=new Promise(resolve=>release=resolve);
 const f=fixture(new Map(),{subtle:{digest:async(...args)=>{await gate;return webcrypto.subtle.digest(...args)}}});
 const pending=f.h.restore([item]);f.user.id='owner-B';f.h.reset();release();await pending;
 assert.equal(f.h.mark(item),false);assert.equal(f.storage.size,0);
});
