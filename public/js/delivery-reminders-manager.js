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
function createReminder(item){
  const row=document.createElement("div");row.className="thebe-delivery-reminder";
  row.dataset.urgent=String(item.daysUntil<=1);
  const content=document.createElement("div");
  const title=document.createElement("strong");title.textContent=label(item);
  const detail=document.createElement("small");
  detail.textContent=`${item.jobReference} · ${item.scheduledDate} · ${item.locationName||"Location"} · ${item.employeeName||"Reporter"}`;
  content.append(title,detail);row.append(content);return row;
}
function popup(){
  let panel=byId("thebeDeliveryManagerPopup");
  if(panel)return panel;
  panel=document.createElement("aside");panel.id="thebeDeliveryManagerPopup";
  panel.className="thebe-delivery-manager-popup";panel.hidden=true;panel.setAttribute("role","dialog");
  panel.setAttribute("aria-label","Upcoming delivery and installation reminders");
  const dismiss=document.createElement("button");dismiss.type="button";dismiss.className="thebe-delivery-dismiss";dismiss.textContent="×";dismiss.setAttribute("aria-label","Close delivery reminders");dismiss.addEventListener("click",()=>setPopupOpen(false,true));
  panel.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!panel.hidden){event.stopPropagation();setPopupOpen(false,true)}
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
  const top=vv?.offsetTop||0,left=vv?.offsetLeft||0;
  const right=Math.max(0,window.innerWidth-left-(vv?.width||window.innerWidth));
  const bottom=Math.max(0,window.innerHeight-top-(vv?.height||window.innerHeight));
  panel.style.setProperty("--thebe-vv-top",top+"px");
  panel.style.setProperty("--thebe-vv-bottom",bottom+"px");
  panel.style.setProperty("--thebe-vv-left",left+"px");
  panel.style.setProperty("--thebe-vv-right",right+"px");
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
    if(start.moved)positionBell(button,start.rect.left+dx,start.rect.top+dy);
  });
  button.addEventListener("pointerup",event=>{
    if(!start||event.pointerId!==start.id)return;
    if(start.moved){
      const r=button.getBoundingClientRect();
      persist(positionBell(button,r.left,r.top));
      suppressClick=true;
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
  syncBellLayout();
  toggle.textContent=`🔔 Deliveries & installations (${items.length})`;
  toggle.dataset.count=String(items.length>99?"99+":items.length);
  toggle.setAttribute("aria-label",`Delivery and installation reminders: ${items.length}. Open reminders`);
  if(!items.length)panel.hidden=true;
  toggle.setAttribute("aria-expanded",String(!panel.hidden));
  panel.replaceChildren();
  const close=document.createElement("button");close.type="button";close.className="thebe-delivery-dismiss";close.textContent="×";close.setAttribute("aria-label","Close reminders");close.addEventListener("click",()=>setPopupOpen(false,true));
  const title=document.createElement("h2");title.textContent="Upcoming delivery & installation";
  panel.append(close,title);
  for(const item of items.slice(0,12))panel.append(createReminder(item));
  updateWorkspace(items);
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
    if(dayShown!==today){seen.clear();dayShown=today}
    const newDue=items.filter(x=>!seen.has([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|")));
    for(const x of newDue)seen.add([x.locationId,x.employeeId,x.jobType,x.jobReference,today].join("|"));
    render(items);
    if(newDue.length && !window.matchMedia("(max-width: 1000px)").matches)setPopupOpen(true);
  }catch{
    // Unauthorized visitors and transient failures must not reveal company data.
  }finally{loading=false}
}
document.addEventListener("DOMContentLoaded",()=>{setTimeout(load,1200);setInterval(load,60*60*1000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()})});
})();
