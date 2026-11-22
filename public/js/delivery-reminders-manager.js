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
  const toggle=byId("thebeDeliveryManagerBell");
  if(toggle)toggle.setAttribute("aria-expanded",String(open));
  if(focusChange){
    const target=open?panel.querySelector(".thebe-delivery-dismiss"):toggle;
    if(target&&!target.hidden)target.focus({preventScroll:true});
  }
}
// Keep the floating control in the visible, unobstructed mobile area.
const bellPositionKey="thebe.delivery.bell.position.v1";
function positionBell(button,x,y){
  const vv=window.visualViewport;
  const width=vv?.width||window.innerWidth,height=vv?.height||window.innerHeight;
  const left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
  const rect=button.getBoundingClientRect();
  const w=rect.width||44,h=rect.height||44;
  const safeBottom=104;
  const px=Math.max(left+8,Math.min(x,left+width-w-8));
  const py=Math.max(top+8,Math.min(y,top+height-h-safeBottom));
  button.style.setProperty("left",px+"px","important");
  button.style.setProperty("top",py+"px","important");
  button.style.setProperty("right","auto","important");
  button.style.setProperty("bottom","auto","important");
  return {x:px,y:py};
}
function enableBellDrag(button){
  if(!window.matchMedia("(max-width: 1000px)").matches)return;
  let saved;
  try{saved=JSON.parse(localStorage.getItem(bellPositionKey)||"null")}catch{}
  const restore=()=>{if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))positionBell(button,saved.x,saved.y)};
  restore();
  window.addEventListener("resize",restore);
  window.visualViewport?.addEventListener("resize",restore);
  window.visualViewport?.addEventListener("scroll",restore);
  let start=null,suppressClick=false;
  button.style.touchAction="none";
  button.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    start={id:event.pointerId,x:event.clientX,y:event.clientY,
      rect:button.getBoundingClientRect(),moved:false};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointermove",event=>{
    if(!start||event.pointerId!==start.id)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.hypot(dx,dy)>7)start.moved=true;
    if(start.moved)positionBell(button,start.rect.left+dx,start.rect.top+dy);
  });
  const finish=event=>{
    if(!start||event.pointerId!==start.id)return;
    if(start.moved){
      const r=button.getBoundingClientRect();
      saved=positionBell(button,r.left,r.top);
      try{localStorage.setItem(bellPositionKey,JSON.stringify(saved))}catch{}
      suppressClick=true;
    }
    start=null;
  };
  button.addEventListener("pointerup",finish);
  button.addEventListener("pointercancel",finish);
  button.addEventListener("click",event=>{
    if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false}
  },true);
  button.addEventListener("keydown",event=>{
    if(!event.altKey||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
    event.preventDefault();
    const r=button.getBoundingClientRect();
    saved=positionBell(button,r.left+(event.key==="ArrowLeft"?-24:event.key==="ArrowRight"?24:0),
      r.top+(event.key==="ArrowUp"?-24:event.key==="ArrowDown"?24:0));
    try{localStorage.setItem(bellPositionKey,JSON.stringify(saved))}catch{}
  });
}
function bell(){
  let button=byId("thebeDeliveryManagerBell");
  if(button)return button;
  button=document.createElement("button");button.id="thebeDeliveryManagerBell";button.type="button";button.className="thebe-delivery-manager-bell";button.hidden=true;
  button.setAttribute("aria-controls","thebeDeliveryManagerPopup");
  button.setAttribute("aria-expanded","false");
  button.addEventListener("click",()=>setPopupOpen(popup().hidden,true));
  button.title="Drag to move; Alt + arrow keys to reposition";
  enableBellDrag(button);
  document.body.append(button);return button;
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
