(()=>{
"use strict";
const byId=id=>document.getElementById(id);
const seen=new Set();
let dayShown="";
let reminders=[];
let unreadOnly=true;
let loading=false,loadEpoch=0,lastScope=null;
// The canonical authenticated Workspace declares lexical 'let currentUser',
// which need not be present as window.currentUser. This UI scope stays private.
function reminderScope(){
 let user=null;
 try{
  if(typeof currentUser!=="undefined"&&currentUser&&typeof currentUser==="object")
   user=currentUser;
 }catch{}
 if(!user)user=window.currentUser||{};
 return JSON.stringify([
  String(user.id??""),String(user.tenantId??""),
  String(byId("companySelect")?.value??"")
 ]);
}
function localDate(){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function label(item){
  const time=item.daysUntil<0?`Overdue ${Math.abs(item.daysUntil)} day${item.daysUntil===-1?"":"s"}`:item.daysUntil===0?"Today":item.daysUntil===1?"Tomorrow":`In ${item.daysUntil} days`;
  return `${item.jobType==="installation"?"Installation":"Delivery"} · ${time}`;
}

const readReminders=new Set();
// Only opaque acknowledgement digests are persisted on this browser. Job
// details remain in the authenticated response and are never cached here.
const readStoragePrefix="thebe.delivery.read.v1.";
let readStorageKey=null,readDigests=new Map(),storedReads=[];
async function digest(value){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
async function restoreReadReminders(items,scope,epoch){
 const [user,tenant]=JSON.parse(scope);
 let storageKey=null,entries=[],digests=new Map();
 try{
  if(user&&tenant){
   storageKey=readStoragePrefix+await digest(scope);
   digests=new Map(await Promise.all(items.map(async item=>{
    const key=reminderKey(item);return [key,await digest(key)];
   })));
   const raw=localStorage.getItem(storageKey);
   const parsed=raw?JSON.parse(raw):[];
   if(Array.isArray(parsed))entries=parsed.filter(x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x)).slice(-500);
  }
 }catch{storageKey=null;entries=[]}
 if(epoch!==loadEpoch||scope!==reminderScope())return;
 readStorageKey=storageKey;readDigests=digests;storedReads=entries;
 const saved=new Set(entries);
 for(const item of items)if(saved.has(digests.get(reminderKey(item))))readReminders.add(reminderKey(item));
}
function saveReadReminder(item){
 const value=readDigests.get(reminderKey(item));
 if(!readStorageKey||!value)return false;
 try{
  const parsed=JSON.parse(localStorage.getItem(readStorageKey)||"[]");
  const existing=Array.isArray(parsed)?parsed.filter(x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x)):[];
  storedReads=Array.from(new Set([...existing,...storedReads,value])).slice(-500);
  localStorage.setItem(readStorageKey,JSON.stringify(storedReads));
  return true;
 }catch{return false}
}
function reminderKey(item){
 return [item.sourceReportId||"",item.locationId||"",item.employeeId||"",item.jobType||"",item.jobReference||"",item.scheduledDate||""].join("|");
}
function updateReminderCounts(){
 const unread=reminders.filter(item=>!readReminders.has(reminderKey(item))).length;
 const toggle=byId("thebeDeliveryManagerBell");
 if(toggle){toggle.dataset.count=String(unread>99?"99+":unread);
  toggle.setAttribute("aria-label","Notifications: "+unread+" unread delivery and installation reminders. Open notifications")}
 const count=byId("thebeDeliveryCount");
 if(count)count.textContent=String(unread);
 const unreadFilter=byId("thebeDeliveryUnread");
 if(unreadFilter)unreadFilter.textContent="Unread "+unread;
 const markAll=byId("thebeDeliveryMarkAll");
 if(markAll)markAll.disabled=unread===0;
}
function reminderTime(item){
 const days=item.daysUntil;
 return days<0?`${Math.abs(days)} day${days===-1?"":"s"} overdue`:days===0?"Today":days===1?"Tomorrow":`In ${days} days`;
}
function reminderDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return "Date unavailable";
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}).format(date):"Date unavailable";
}
function markRemindersRead(items,scope){
 if(scope!==reminderScope()){refreshAfterWorkspaceChange();return}
 let saved=true;
 for(const item of items){readReminders.add(reminderKey(item));if(!saveReadReminder(item))saved=false}
 updateReminderCounts();renderReminderList();updateWorkspace(reminders);
 const status=byId("thebeDeliveryActionStatus");
 if(status)status.textContent=(saved?"Saved as read on this browser.":"Marked as read for this visit; read status could not be saved on this browser.")+" This does not complete the delivery or installation.";
}
function renderReminderList(){
 const list=byId("thebeDeliveryList");
 if(!list)return;
 const items=reminders.filter(item=>!unreadOnly||!readReminders.has(reminderKey(item)))
  .sort((a,b)=>a.daysUntil-b.daysUntil||String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
 list.replaceChildren();
 if(!items.length){
  const empty=document.createElement("p");empty.className="thebe-delivery-empty";
  empty.textContent=unreadOnly?"No unread reminders. Select All to view read reminders.":"No scheduled reminders.";
  list.append(empty);return;
 }
 let group="";
 for(const item of items.slice(0,12)){
  const next=item.daysUntil<=0?"Needs attention":"Upcoming";
  if(next!==group){const heading=document.createElement("h3");heading.className="thebe-delivery-group";heading.textContent=next;list.append(heading);group=next}
  list.append(createReminder(item,true));
 }
 if(items.length>12){const more=document.createElement("p");more.className="thebe-delivery-empty";more.textContent="Showing the first 12 of "+items.length+" reminders. View Daily Reports for all jobs.";list.append(more)}
}
function openReminderTask(item){
 const status=byId("thebeDeliveryActionStatus");
 if(typeof window.showView!=="function"||!byId("dailyreports")){
  if(status)status.textContent="Daily Reports is unavailable in this workspace. No changes were made.";
  return;
 }
 try{
  window.showView("dailyreports");
  setPopupOpen(false,false);
  let attempts=0;
  const focusTask=()=>{
   const rows=byId("thebeDeliveryWorkspace")?.querySelectorAll(".thebe-delivery-reminder")||[];
   const target=Array.from(rows).find(row=>row.dataset.reminderKey===reminderKey(item));
   if(target){target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView?.({block:"center"});}
   else if(attempts++<5)setTimeout(focusTask,80);
   else byId("dailyreports")?.focus?.({preventScroll:true});
  };
  requestAnimationFrame(focusTask);
 }catch{
  if(status)status.textContent="Daily Reports could not be opened. No changes were made.";
 }
}
function createReminder(item,withActions=false){
 const scope=reminderScope();
 const row=document.createElement("article");row.className="thebe-delivery-reminder";
 row.dataset.urgent=String(item.daysUntil<=1);
 row.dataset.read=String(readReminders.has(reminderKey(item)));
 row.dataset.reminderKey=reminderKey(item);
 row.dataset.timing=item.daysUntil<0?"overdue":item.daysUntil===0?"today":"upcoming";
 const copy=document.createElement("div");copy.className="thebe-delivery-reminder-copy";
 const title=document.createElement("strong");title.textContent=withActions?(item.jobType==="installation"?"Installation":"Delivery")+" · "+(item.locationName||"Location unavailable"):label(item);
 const detail=document.createElement("small");
 detail.textContent="Job "+(item.jobReference||"Unspecified")+(withActions?"":" · "+(item.scheduledDate||"Date unavailable")+" · "+(item.locationName||"Location unavailable")+" · "+(item.employeeName||"Reporter unavailable"));
 copy.append(title);
 if(withActions){
  const timing=document.createElement("span");timing.className="thebe-delivery-reminder-timing";timing.textContent=reminderTime(item);
  const date=document.createElement("time");date.className="thebe-delivery-date";date.textContent=reminderDate(item.scheduledDate);date.dateTime=item.scheduledDate||"";
  copy.append(timing,date);
 }
 copy.append(detail);row.append(copy);
 if(withActions){
  const actions=document.createElement("div");actions.className="thebe-delivery-reminder-actions";
  const view=document.createElement("button");view.type="button";view.className="thebe-delivery-view-task";
  view.textContent="View task";
  view.setAttribute("aria-label","View "+(item.jobType==="installation"?"installation":"delivery")+" "+(item.jobReference||"job")+" in Daily Reports");
  view.addEventListener("click",()=>openReminderTask(item));
  const read=document.createElement("button");read.type="button";read.className="thebe-delivery-mark-read";
  const alreadyRead=readReminders.has(reminderKey(item));
  read.textContent=alreadyRead?"✓ Read":"✓ Mark read";read.setAttribute("aria-pressed",String(alreadyRead));
  read.disabled=alreadyRead;
  read.addEventListener("click",()=>{
   markRemindersRead([item],scope);
   // The Unread row disappears after acknowledgement; keep focus usable.
   (byId("thebeDeliveryList")?.querySelector(".thebe-delivery-mark-read:not([disabled])")||byId("thebeDeliveryAll"))?.focus({preventScroll:true});
  });
  actions.append(view,read);row.append(actions);
 }
 return row;
}
function popup(){
  let panel=byId("thebeDeliveryManagerPopup");
  if(panel)return panel;
  panel=document.createElement("section");panel.id="thebeDeliveryManagerPopup";
  panel.className="thebe-delivery-manager-popup";panel.hidden=true;panel.setAttribute("role","dialog");
  panel.setAttribute("aria-label","Upcoming delivery and installation reminders");
  const dismiss=document.createElement("button");dismiss.type="button";dismiss.className="thebe-delivery-dismiss";dismiss.textContent="×";dismiss.setAttribute("aria-label","Close delivery reminders");dismiss.addEventListener("click",()=>setPopupOpen(false,true));
  panel.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!panel.hidden){event.stopPropagation();setPopupOpen(false,true);return}
    // While the phone sheet is open, keep keyboard focus inside its controls.
    if(event.key!=="Tab"||panel.hidden||!mobileBell())return;
    const controls=Array.from(panel.querySelectorAll("button:not([disabled])")).filter(node=>node.getClientRects().length);
    if(!controls.length)return;
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  panel.append(dismiss);document.body.append(panel);return panel;
}
function setPopupOpen(open,focusChange=false){
  const panel=popup();
  panel.hidden=!open;
  syncReminderViewport();
  const toggle=byId("thebeDeliveryManagerBell");
  if(toggle)toggle.setAttribute("aria-expanded",String(open));
  if(focusChange){
    const target=open?panel.querySelector(".thebe-delivery-dismiss"):toggle;
    if(target&&!target.hidden)target.focus({preventScroll:true});
  }
}
// The bell is movable on all screens. Store only device-local coordinates,
// never reminder content, account information, or authentication details.
const bellPositionKey="thebe.delivery.bell.position.v2";
const mobileBell=()=>window.matchMedia("(max-width: 1000px)").matches;
let syncBellLayout=()=>{};
function syncReminderViewport(){
 const panel=byId("thebeDeliveryManagerPopup");
 if(!panel)return;
 const vv=window.visualViewport;
 const left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
 const width=vv?.width||window.innerWidth,height=vv?.height||window.innerHeight;
 const sheetOpen=!panel.hidden&&mobileBell();
 document.body.classList.toggle("thebe-delivery-sheet-open",sheetOpen);
 panel.setAttribute("aria-modal",String(sheetOpen));
 panel.dataset.compactViewport=String(height<420);
 panel.style.setProperty("--thebe-vv-height",height+"px");
 panel.style.setProperty("--thebe-vv-top",top+"px");
 panel.style.setProperty("--thebe-vv-bottom",Math.max(0,window.innerHeight-top-height)+"px");
 panel.style.setProperty("--thebe-vv-left",left+"px");
 panel.style.setProperty("--thebe-vv-right",Math.max(0,window.innerWidth-left-width)+"px");
 // The agreed mobile sheet is viewport-anchored and independent of where
 // the owner drags the bell. This prevents bell placement from shrinking
 // the readable notification area on short screens or at 200% zoom.
}
function clearBellCoordinates(button){
  for(const property of ["left","top","right","bottom"])button.style.removeProperty(property);
}
function positionBell(button,x,y){
  const vv=window.visualViewport;
  const width=vv?.width||window.innerWidth,height=vv?.height||window.innerHeight;
  const left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
  const rect=button.getBoundingClientRect();
  const w=rect.width||44,h=rect.height||44;
  // Bottom rail, its touch targets, and Android safe-area remain protected.
  const minX=left+8,minY=top+8;
  const maxX=Math.max(minX,left+width-w-8);
  const maxY=Math.max(minY,top+height-h-(mobileBell()?104:8));
  let px=Math.max(minX,Math.min(x,maxX));
  let py=Math.max(minY,Math.min(y,maxY));
  const ai=byId("thebeAiDockPill");
  if(ai&&!ai.hidden&&ai.getClientRects().length){
   const a=ai.getBoundingClientRect(),gap=12;
   const overlaps=(nx,ny)=>nx<a.right+gap&&nx+w>a.left-gap&&ny<a.bottom+gap&&ny+h>a.top-gap;
   if(overlaps(px,py)){
    const options=[{x:a.left-w-gap,y:py},{x:a.right+gap,y:py},{x:px,y:a.top-h-gap},{x:px,y:a.bottom+gap}]
     .filter(p=>p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY&&!overlaps(p.x,p.y))
     .sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
    if(options[0]){px=options[0].x;py=options[0].y}
   }
  }
  button.style.setProperty("left",px+"px","important");
  button.style.setProperty("top",py+"px","important");
  button.style.setProperty("right","auto","important");
  button.style.setProperty("bottom","auto","important");
  return {x:px,y:py};
}
function enableBellDrag(button){
  let saved=null,start=null,suppressClick=false;
  try{
    const parsed=JSON.parse(localStorage.getItem(bellPositionKey)||"null");
    if(parsed&&Number.isFinite(parsed.x)&&Number.isFinite(parsed.y))saved=parsed;
  }catch{}
  const persist=value=>{
    saved=value;
    try{
      if(value)localStorage.setItem(bellPositionKey,JSON.stringify(value));
      else localStorage.removeItem(bellPositionKey);
    }catch{}
  };
  const sync=()=>{
    syncReminderViewport();
    if(button.hidden)return;
    if(!mobileBell()&&!saved){clearBellCoordinates(button);return}
    const rect=button.getBoundingClientRect();
    const origin=saved||{x:rect.left,y:rect.top};
    positionBell(button,origin.x,origin.y);
    // Retain the user's preference; re-clamp it when the viewport changes.
    // Keep original coordinates so temporary keyboard/rotation clamping does
    // not replace the user's preferred location.
    syncReminderViewport();
  };
  window.addEventListener("resize",sync);
  window.addEventListener("orientationchange",sync);
  window.visualViewport?.addEventListener("resize",sync);
  window.visualViewport?.addEventListener("scroll",sync);
  button.addEventListener("pointerdown",event=>{
    if(!event.isPrimary||event.button!==0)return;
    start={id:event.pointerId,x:event.clientX,y:event.clientY,
      rect:button.getBoundingClientRect(),moved:false};
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener("pointermove",event=>{
    if(!start||event.pointerId!==start.id)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.hypot(dx,dy)>7)start.moved=true;
    if(start.moved){positionBell(button,start.rect.left+dx,start.rect.top+dy);syncReminderViewport()}
  });
  button.addEventListener("pointerup",event=>{
    if(!start||event.pointerId!==start.id)return;
    if(start.moved){
      const r=button.getBoundingClientRect();
      persist(positionBell(button,r.left,r.top));
      syncReminderViewport();
      suppressClick=true;
      // Pointer capture normally produces a click after pointerup. Clear the
      // guard next tick if the browser does not emit that click.
      setTimeout(()=>{suppressClick=false},0);
    }
    start=null;
  });
  button.addEventListener("pointercancel",event=>{
    if(start?.id===event.pointerId){const rect=start.rect;start=null;positionBell(button,rect.left,rect.top);syncReminderViewport()}
  });
  // Capture precedes the ordinary open handler so dragging never opens the sheet.
  button.addEventListener("click",event=>{
    if(suppressClick){
      event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
    }
  },true);
  button.addEventListener("keydown",event=>{
    if(!event.altKey)return;
    if(event.key==="Home"){
      event.preventDefault();
      persist(null);clearBellCoordinates(button);sync();
      return;
    }
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
    event.preventDefault();
    const r=button.getBoundingClientRect();
    persist(positionBell(button,
      r.left+(event.key==="ArrowLeft"?-24:event.key==="ArrowRight"?24:0),
      r.top+(event.key==="ArrowUp"?-24:event.key==="ArrowDown"?24:0)));
    syncReminderViewport();
  });
  syncBellLayout=sync;
  if(!button.hidden)sync();
}
function bell(){
  let button=byId("thebeDeliveryManagerBell");
  if(button)return button;
  button=document.createElement("button");button.id="thebeDeliveryManagerBell";button.type="button";button.className="thebe-delivery-manager-bell";button.hidden=true;
  button.setAttribute("aria-controls","thebeDeliveryManagerPopup");
  button.setAttribute("aria-expanded","false");
  button.addEventListener("click",()=>setPopupOpen(popup().hidden,true));
  button.title="Drag to move. Alt + arrow keys to reposition; Alt + Home to reset.";
  button.setAttribute("aria-keyshortcuts","Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home");
  document.body.append(button);
  enableBellDrag(button);
  return button;
}
function updateWorkspace(items){
  const section=byId("dailyreports");
  if(!section)return;
  let box=byId("thebeDeliveryWorkspace");
  if(!box){box=document.createElement("section");box.id="thebeDeliveryWorkspace";box.className="thebe-delivery-workspace";section.prepend(box)}
  box.replaceChildren();
  const heading=document.createElement("h3");const overdue=items.filter(x=>x.daysUntil<0).length;
  heading.textContent=`Delivery / installation: ${items.length} needing attention${overdue?` · ${overdue} overdue`:""}`;
  box.append(heading);
  if(!items.length){const empty=document.createElement("p");empty.textContent="No scheduled deliveries or installations due in the next 4 days, and no overdue items in the last 7 days.";box.append(empty);return}
  for(const item of items.slice(0,12))box.append(createReminder(item));
}
function render(items){
 reminders=items;
 const toggle=bell(),panel=popup();
 toggle.hidden=items.length===0;
 toggle.textContent="🔔 Notifications";
 if(!items.length)panel.hidden=true;
 toggle.setAttribute("aria-expanded",String(!panel.hidden));
 panel.replaceChildren();
 const header=document.createElement("header");header.className="thebe-delivery-sheet-header";
 const headText=document.createElement("div");headText.className="thebe-delivery-sheet-heading";
 const title=document.createElement("h2");title.id="thebeDeliveryTitle";
 title.textContent="Notifications ";
 const count=document.createElement("span");count.id="thebeDeliveryCount";count.className="thebe-delivery-count-badge";
 title.append(count);
 const summary=document.createElement("p");summary.id="thebeDeliverySummary";summary.className="thebe-delivery-summary";
 summary.textContent="Deliveries & installations";
 headText.append(title,summary);
 const close=document.createElement("button");close.type="button";close.className="thebe-delivery-dismiss";
 close.textContent="×";close.setAttribute("aria-label","Close reminders");
 close.addEventListener("click",()=>setPopupOpen(false,true));
 header.append(headText,close);
 const filters=document.createElement("div");filters.className="thebe-delivery-filters";
 filters.setAttribute("role","group");filters.setAttribute("aria-label","Filter notifications");
 for(const [id,text,onlyUnread] of [["thebeDeliveryUnread","Unread",true],["thebeDeliveryAll","All",false]]){
  const button=document.createElement("button");button.type="button";button.id=id;button.textContent=text;
  button.setAttribute("aria-pressed",String(unreadOnly===onlyUnread));
  button.setAttribute("aria-controls","thebeDeliveryList");
  button.addEventListener("click",()=>{
   unreadOnly=onlyUnread;
   for(const child of filters.querySelectorAll("button[aria-pressed]"))child.setAttribute("aria-pressed",String(child===button));
   renderReminderList();
  });filters.append(button);
 }
 const markAll=document.createElement("button");markAll.type="button";markAll.id="thebeDeliveryMarkAll";
 markAll.textContent="Mark all read";
 const scope=reminderScope();
 markAll.addEventListener("click",()=>{
  markRemindersRead(reminders.filter(item=>!readReminders.has(reminderKey(item))),scope);
  byId("thebeDeliveryAll")?.focus({preventScroll:true});
 });filters.append(markAll);
 const list=document.createElement("div");list.id="thebeDeliveryList";list.className="thebe-delivery-sheet-list";
 const footer=document.createElement("footer");footer.className="thebe-delivery-sheet-footer";
 const note=document.createElement("span");
 note.textContent="Reading a reminder does not complete the job.";
 const status=document.createElement("span");status.id="thebeDeliveryActionStatus";
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 footer.append(note,status);
 panel.setAttribute("aria-labelledby","thebeDeliveryTitle");
 panel.append(header,filters,list,footer);
 updateReminderCounts();
 renderReminderList();
 updateWorkspace(items);
 syncBellLayout();
 syncReminderViewport();
}
// A failed authenticated read cannot vouch for the cached reminder list. Remove
// all previously rendered job details rather than leaving another session's
// or an out-of-date company's reminders available on screen.
function clearRemindersAfterReadFailure(){
 reminders=[];seen.clear();readReminders.clear();dayShown="";
 unreadOnly=true;
 readStorageKey=null;readDigests.clear();storedReads=[];
 const panel=byId("thebeDeliveryManagerPopup");
 if(panel){panel.hidden=true;panel.replaceChildren()}
 const bell=byId("thebeDeliveryManagerBell");
 if(bell){
  bell.hidden=true;bell.dataset.count="0";
  bell.setAttribute("aria-expanded","false");
 }
 byId("thebeDeliveryWorkspace")?.remove();
 // The sheet was dismissed without setPopupOpen(): also release the mobile
 // foreground-sheet state so the bottom rail is not left hidden after a 401/503.
 syncReminderViewport();
}
async function load(){
  if(loading||document.hidden)return;
  const client=globalThis.BW?.api?.createClient?.({timeoutMs:15000,retries:0});
  if(!client)return;
  const epoch=++loadEpoch,scope=reminderScope();
  if(lastScope!==null&&scope!==lastScope)clearRemindersAfterReadFailure();
  lastScope=scope;
  loading=true;
  try{
    const today=localDate();
    const data=await client.request(`/api/daily-reporting/dashboard?date=${encodeURIComponent(today)}`,{method:"GET",cache:"no-store"});
    // Responses started under a previous company/login must not repaint the
    // current company's sheet, even if the old request resolves last.
    if(epoch!==loadEpoch)return;
    if(scope!==reminderScope()){
      clearRemindersAfterReadFailure();
      lastScope=reminderScope();
      return;
    }
    const items=Array.isArray(data.deliveryReminders)?data.deliveryReminders:[];
    await restoreReadReminders(items,scope,epoch);
    if(epoch!==loadEpoch)return;
    if(scope!==reminderScope()){
      clearRemindersAfterReadFailure();lastScope=reminderScope();return;
    }
    if(dayShown!==today){seen.clear();dayShown=today}
    const newDue=items.filter(x=>!readReminders.has(reminderKey(x))&&!seen.has([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|")));
    for(const x of newDue)seen.add([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|"));
    render(items);
    if(newDue.length && !window.matchMedia("(max-width: 1000px)").matches)setPopupOpen(true);
  }catch{
    // Only the currently scoped request can clear or change current UI.
    if(epoch===loadEpoch)clearRemindersAfterReadFailure();
  }finally{if(epoch===loadEpoch)loading=false}
}
function refreshAfterWorkspaceChange(){
  // Invalidate any request already in flight, clear the old private DOM first,
  // then let the existing authenticated GET confirm the new workspace state.
  ++loadEpoch;
  loading=false;
  lastScope=reminderScope();
  clearRemindersAfterReadFailure();
  if(!document.hidden)queueMicrotask(()=>void load());
}
document.addEventListener("DOMContentLoaded",()=>{
 setTimeout(load,1200);
 setInterval(load,60*60*1000);
 document.addEventListener("change",event=>{
  if(event.target?.id==="companySelect")refreshAfterWorkspaceChange();
 });
 window.addEventListener("thebe:workspace-ready",refreshAfterWorkspaceChange);
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(lastScope!==null&&lastScope!==reminderScope())refreshAfterWorkspaceChange();
  else load();
 });
});
})();
