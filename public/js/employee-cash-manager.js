// Opt-in owner/manager cash reconciliation panel; mounted inside People.
const node=(doc,tag,value,cls)=>{
 const n=doc.createElement(tag);if(value!==undefined&&value!==null)n.textContent=String(value);if(cls)n.className=cls;return n;
};
const money=x=>"P"+(Number(x||0)/100).toLocaleString("en-BW",{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=x=>{const m=/^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(String(x||"").trim());return m?Number(m[1])*100+Number((m[2]||"").padEnd(2,"0")):null};
const dateToday=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Gaborone"});
const field=(doc,name,input)=>{const el=node(doc,"label",name);el.append(input);return el};
const requestKey=()=>crypto.randomUUID().replaceAll("-","");
export async function mountEmployeeCashManager(host,{client,employees=[]}={}){
 if(!host||!client)return false;
 let data;
 try{data=await client.request("/api/employee-self-service/cash")}catch{return false}
 const doc=host.ownerDocument,section=node(doc,"section",null,"thebe-staff-manager");
 section.append(node(doc,"h3","Employee cash & expenses"),
  node(doc,"p","Review actual cash counted, cash issued and expenses reported. This register does not move money or post to the Money ledger."));
 const message=node(doc,"p");message.setAttribute("role","status");message.setAttribute("aria-live","polite");section.append(message);
 const form=node(doc,"form"),employee=node(doc,"select"),amount=node(doc,"input"),purpose=node(doc,"input"),on=node(doc,"input"),button=node(doc,"button","Record cash issued");
 for(const e of employees){const option=node(doc,"option",e.full_name||"Employee");option.value=String(e.id);employee.append(option)}
 amount.type="text";amount.inputMode="decimal";amount.placeholder="0.00";amount.required=true;
 purpose.type="text";purpose.placeholder="Reason and cash handover reference";purpose.minLength=3;purpose.maxLength=500;purpose.required=true;
 on.type="date";on.value=dateToday();on.required=true;button.type="submit";
 form.append(node(doc,"h4","Issue or record employee cash advance"),field(doc,"Employee",employee),
  field(doc,"Amount in Pula",amount),field(doc,"Purpose",purpose),field(doc,"Date",on),button);
 if(!employees.length)button.disabled=true;
 const activity=node(doc,"div",null,"thebe-cash-table-wrap"),counts=node(doc,"div",null,"thebe-cash-table-wrap"),balances=node(doc,"div",null,"thebe-cash-table-wrap");
 section.append(form,node(doc,"h4","Cash position by employee"),node(doc,"p","Expected cash is based on recorded advances minus all reported spending, including rejected expenses. Physical counts are shown separately and may be from an earlier date."),balances,node(doc,"h4","Expenses and advances"),activity,node(doc,"h4","Physical cash counts"),counts);
 host.replaceChildren(section);
 async function refresh(){data=await client.request("/api/employee-self-service/cash");render()}
 async function decide(path,decision,note){
  await client.request(path,{method:"POST",body:JSON.stringify({decision,note})});await refresh();
 }
 function table(parent,headers,rows){
  parent.replaceChildren();const t=node(doc,"table"),head=node(doc,"thead"),top=node(doc,"tr");
  for(const h of headers)top.append(node(doc,"th",h));head.append(top);t.append(head);
  const body=node(doc,"tbody");
  for(const row of rows){const tr=node(doc,"tr");for(const cell of row){const td=node(doc,"td");if(typeof cell==="string")td.textContent=cell;else td.append(cell);tr.append(td)}body.append(tr)}
  if(!rows.length){const tr=node(doc,"tr"),td=node(doc,"td","No records yet");td.colSpan=headers.length;tr.append(td);body.append(tr)}
  t.append(body);parent.append(t);
 }
 function actions(type,item){
  const container=node(doc,"div",null,"thebe-staff-manager__actions");
  if(item.status!=="submitted")return node(doc,"span",item.status);
  const note=node(doc,"textarea");note.maxLength=500;note.placeholder="Reason if rejecting or flagging";note.rows=2;
  const path="/api/employee-self-service/cash/"+type+"/"+encodeURIComponent(item.id)+"/review";
  for(const [decision,label] of [["approve","Approve"],[type==="entries"?"reject":"flag",type==="entries"?"Reject":"Flag discrepancy"]]){
   const b=node(doc,"button",label,decision==="approve"?null:"thebe-staff-secondary");b.type="button";
   b.addEventListener("click",async()=>{
    b.disabled=true;message.textContent="";
    try{await decide(path,decision,note.value);message.textContent="Cash report reviewed."}
    catch(e){message.textContent=String(e?.message||"Review failed.");b.disabled=false}
   });container.append(b);
  }
  const wrapper=node(doc,"div");wrapper.append(note,container);return wrapper;
 }
 function render(){
  table(balances,["Employee","Cash issued","Cash spent","Expected cash","Last physical count","Review required"],(data.balances||[]).map(r=>[
   r.employee_name||"Employee",money(r.advances_minor),money(r.spent_minor),money(r.expected_minor),
   r.last_count_date?(money(r.last_counted_minor)+" · "+r.last_count_date):"Not counted",
   r.pending_minor||r.rejected_minor?("Pending "+money(r.pending_minor)+" · Disputed "+money(r.rejected_minor)):"No expense exceptions"
  ]));
  table(activity,["Date","Employee","Purpose","Amount","Status"],(data.entries||[]).map(r=>[
   r.occurred_on,r.employee_name||"Employee",(r.kind==="advance"?"Cash issued: ":"Expense: ")+r.purpose,
   (r.kind==="expense"?"−":"+")+money(r.amount_minor),actions("entries",r)]));
  table(counts,["Date","Employee","Cash counted","Status"],(data.counts||[]).map(r=>[
   r.report_date,r.employee_name||"Employee",money(r.counted_minor),actions("counts",r)]));
 }
 render();
 let key=null;
 form.addEventListener("input",()=>{key=null});
 form.addEventListener("submit",async event=>{
  event.preventDefault();const amountMinor=cents(amount.value);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>10000000){message.textContent="Enter an amount up to P100,000.";return}
  key=key||requestKey();button.disabled=true;message.textContent="";
  try{await client.request("/api/employee-self-service/cash/advances",{method:"POST",body:JSON.stringify({
    employeeId:employee.value,amountMinor,purpose:purpose.value.trim(),occurredOn:on.value,requestKey:key})});
   form.reset();on.value=dateToday();key=null;message.textContent="Cash issued recorded, pending physical reconciliation.";await refresh()
  }catch(e){message.textContent=String(e?.message||"Could not record cash issued.")}
  finally{button.disabled=!employees.length}
 });
 return true;
}
