(()=>{
"use strict";
const byId=id=>document.getElementById(id);
const seen=new Set();
let dayShown="";
let reminders=[];
let loading=false;
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
function reminderKey(item){
 return [item.sourceReportId||"",item.locationId||"",item.employeeId||"",item.jobType||"",item.jobReference||"",item.scheduledDate||""].join("|");
}
function updateReminderCounts(){
 const unread=reminders.filter(item=>!readReminders.has(reminderKey(item))).length;
 const toggle=byId("thebeDeliveryManagerBell");
 if(toggle){toggle.dataset.count=String(unread>99?"99+":unread);
  toggle.setAttribute("aria-label","Notifications: "+unread+" unread delivery and installation reminders. Open notifications")}
 const summary=byId("thebeDeliverySummary");
 if(summary)summary.textContent=unread+" unread · "+reminders.length+" scheduled reminder"+(reminders.length===1?"":"s");
 const title=byId("thebeDeliveryTitle");
 if(title)title.textContent="Notifications ("+unread+")";
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
 const row=document.createElement("article");row.className="thebe-delivery-reminder";
 row.dataset.urgent=String(item.daysUntil<=1);
 row.dataset.read=String(readReminders.has(reminderKey(item)));
 row.dataset.reminderKey=reminderKey(item);
 const copy=document.createElement("div");copy.className="thebe-delivery-reminder-copy";
 const title=document.createElement("strong");title.textContent=withActions?"Upcoming delivery & installation":label(item);
 const detail=document.createElement("small");
 detail.textContent="Job "+(item.jobReference||"Unspecified")+" · "+(item.scheduledDate||"Date unavailable")+" · "+(item.locationName||"Location unavailable")+" · "+(item.employeeName||"Reporter unavailable");
 copy.append(title);
 if(withActions){const timing=document.createElement("span");timing.className="thebe-delivery-reminder-timing";timing.textContent=label(item);copy.append(timing)}
 copy.append(detail);row.append(copy);
 if(withActions){
  const actions=document.createElement("div");actions.className="thebe-delivery-reminder-actions";
  const view=document.createElement("button");view.type="button";view.className="thebe-delivery-view-task";
  view.textContent="View Task";
  view.setAttribute("aria-label","View "+(item.jobType==="installation"?"installation":"delivery")+" "+(item.jobReference||"job")+" in Daily Reports");
  view.addEventListener("click",()=>openReminderTask(item));
  const read=document.createElement("button");read.type="button";read.className="thebe-delivery-mark-read";
  const alreadyRead=readReminders.has(reminderKey(item));
  read.textContent=alreadyRead?"Read":"Mark as Read";read.setAttribute("aria-pressed",String(alreadyRead));
  read.addEventListener("click",()=>{
   readReminders.add(reminderKey(item));row.dataset.read="true";
   read.textContent="Read";read.setAttribute("aria-pressed","true");updateReminderCounts();
   const state=byId("thebeDeliveryActionStatus");
   if(state)state.textContent="Marked as read for this visit. This does not complete the delivery or installation.";
  });
  actions.append(view,read);row.append(actions);
 }
 return row;
}
function popup(){
  let panel=byId("thebeDeliveryManagerPopup");
  if(panel)return panel;
  panel=document.createElement("aside");panel.id="thebeDeliveryManagerPopup";
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
// The bell is movable on small screens. Store only device-local coordinates,
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
  const maxY=Math.max(minY,top+height-h-104);
  const px=Math.max(minX,Math.min(x,maxX));
  const py=Math.max(minY,Math.min(y,maxY));
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
    if(!mobileBell()){
      clearBellCoordinates(button);
      return;
    }
    const rect=button.getBoundingClientRect();
    const origin=saved||{x:rect.left,y:rect.top};
    const positioned=positionBell(button,origin.x,origin.y);
    // Retain the user's preference; re-clamp it when the viewport changes.
    if(saved)saved=positioned;
    syncReminderViewport();
  };
  window.addEventListener("resize",sync);
  window.addEventListener("orientationchange",sync);
  window.visualViewport?.addEventListener("resize",sync);
  window.visualViewport?.addEventListener("scroll",sync);
  button.addEventListener("pointerdown",event=>{
    if(!mobileBell()||!event.isPrimary||event.button!==0)return;
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
    if(start?.id===event.pointerId){start=null;sync()}
  });
  // Capture precedes the ordinary open handler so dragging never opens the sheet.
  button.addEventListener("click",event=>{
    if(suppressClick){
      event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
    }
  },true);
  button.addEventListener("keydown",event=>{
    if(!event.altKey||!mobileBell())return;
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
 const eyebrow=document.createElement("span");eyebrow.className="thebe-delivery-eyebrow";
 eyebrow.textContent="🔔 THEBE DESK";
 const title=document.createElement("h2");title.id="thebeDeliveryTitle";
 title.textContent="Notifications (0)";
 const summary=document.createElement("p");summary.id="thebeDeliverySummary";summary.className="thebe-delivery-summary";
 headText.append(eyebrow,title,summary);
 const close=document.createElement("button");close.type="button";close.className="thebe-delivery-dismiss";
 close.textContent="×";close.setAttribute("aria-label","Close reminders");
 close.addEventListener("click",()=>setPopupOpen(false,true));
 header.append(headText,close);
 const list=document.createElement("div");list.className="thebe-delivery-sheet-list";
 for(const item of items.slice(0,12))list.append(createReminder(item,true));
 const footer=document.createElement("footer");footer.className="thebe-delivery-sheet-footer";
 const note=document.createElement("span");
 note.textContent=(items.length>12?"Showing the first 12 of "+items.length+" reminders. ":"")+
   "Read status lasts for this visit; job status changes only in Daily Reports.";
 const status=document.createElement("span");status.id="thebeDeliveryActionStatus";
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 footer.append(note,status);
 panel.setAttribute("aria-labelledby","thebeDeliveryTitle");
 panel.append(header,list,footer);
 updateReminderCounts();
 updateWorkspace(items);
 syncBellLayout();
 syncReminderViewport();
}
// A failed authenticated read cannot vouch for the cached reminder list. Remove
// all previously rendered job details rather than leaving another session's
// or an out-of-date company's reminders available on screen.
function clearRemindersAfterReadFailure(){
 reminders=[];seen.clear();readReminders.clear();dayShown="";
 const panel=byId("thebeDeliveryManagerPopup");
 if(panel){panel.hidden=true;panel.replaceChildren()}
 const bell=byId("thebeDeliveryManagerBell");
 if(bell){
  bell.hidden=true;bell.dataset.count="0";
  bell.setAttribute("aria-expanded","false");
 }
 byId("thebeDeliveryWorkspace")?.remove();
}
async function load(){
  if(loading||document.hidden)return;
  const client=globalThis.BW?.api?.createClient?.({timeoutMs:15000,retries:0});
  if(!client)return;
  loading=true;
  try{
    const today=localDate();
    const data=await client.request(`/api/daily-reporting/dashboard?date=${encodeURIComponent(today)}`,{method:"GET",cache:"no-store"});
    const items=Array.isArray(data.deliveryReminders)?data.deliveryReminders:[];
    if(dayShown!==today){seen.clear();readReminders.clear();dayShown=today}
    const newDue=items.filter(x=>!seen.has([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|")));
    for(const x of newDue)seen.add([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|"));
    render(items);
    if(newDue.length && !window.matchMedia("(max-width: 1000px)").matches)setPopupOpen(true);
  }catch{
    // No successful authenticated read: fail closed, including old DOM and badges.
    clearRemindersAfterReadFailure();
  }finally{loading=false}
}
document.addEventListener("DOMContentLoaded",()=>{setTimeout(load,1200);setInterval(load,60*60*1000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()})});
})();
