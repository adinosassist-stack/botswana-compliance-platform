// Staff cash UI: shown only after server confirms feature access.
(()=>{
 "use strict";
 const h=(tag,content,cls)=>{const e=document.createElement(tag);if(content!==undefined&&content!==null)e.textContent=String(content);if(cls)e.className=cls;return e};
 const p=x=>"P"+(Number(x||0)/100).toLocaleString("en-BW",{minimumFractionDigits:2,maximumFractionDigits:2});
 const cents=str=>{const match=/^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(String(str||"").trim());return match?(Number(match[1])*100+Number((match[2]||"").padEnd(2,"0"))):null};
 const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Gaborone"});
 const field=(name,control)=>{const l=h("label",name);l.append(control);return l};
 const input=(type,required=true)=>{const n=h("input");n.type=type;n.required=required;return n};
 const key=()=>crypto.randomUUID().replaceAll("-","");
 async function mount({api}={}){
  const host=document.getElementById("staffCash");
  if(!host||typeof api!=="function")return false;
  let snapshot;
  try{snapshot=await api("/public/employee/cash")}catch{host.hidden=true;return false}
  host.hidden=false;host.replaceChildren();
  host.append(h("h2","My cash & expenses"),h("p","Record cash spent and count cash physically held. A manager must review your reports. Amounts are not yet posted to Money."));
  const status=h("p","");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  const cards=h("div",null,"thebe-cash-cards"),tableHost=h("div",null,"thebe-cash-table-wrap"),countHistory=h("div",null,"thebe-cash-count-history");
  host.append(cards,status);
  const forms=h("div",null,"thebe-cash-forms");
  const expense=h("form"),category=h("select"),purpose=input("text"),amount=input("text"),receipt=input("text",false),job=input("text",false),on=input("date");
  for(const type of ["transport","materials","fuel","meals","supplies","site","other"]){const o=h("option",type);o.value=type;category.append(o)}
  purpose.maxLength=500;purpose.minLength=3;purpose.placeholder="What was this cash used for?";
  amount.inputMode="decimal";amount.placeholder="0.00";receipt.maxLength=160;receipt.placeholder="Receipt number (or explain later)";
  job.maxLength=120;job.placeholder="Job or site reference (optional)";
  on.value=today();
  const saveExpense=h("button","Report expense");saveExpense.type="submit";
  expense.append(h("h3","Cash used"),field("Category",category),field("Purpose",purpose),
   field("Amount in Pula",amount),field("Date",on),field("Receipt reference",receipt),
   field("Job or site",job),saveExpense);
  const countForm=h("form"),counted=input("text"),countDate=input("date"),countNote=h("textarea");
  counted.inputMode="decimal";counted.placeholder="Cash physically counted";
  countDate.value=today();countNote.maxLength=500;countNote.rows=2;countNote.placeholder="Optional cash handover note";
  const saveCount=h("button","Submit cash count");saveCount.type="submit";
  countForm.append(h("h3","Cash on hand"),field("Cash counted in Pula",counted),
   field("Date",countDate),field("Note",countNote),saveCount);
  forms.append(expense,countForm);host.append(forms,h("h3","Cash activity"),tableHost,h("h3","My daily cash reports"),countHistory);
  function render(data){
   cards.replaceChildren();tableHost.replaceChildren();countHistory.replaceChildren();
   const s=data.summary||{};
   for(const [label,number] of [["Cash issued",s.advancesMinor],["Cash used (reported)",s.reportedSpentMinor],
       ["Expected cash",s.expectedMinor],["Pending review",s.pendingReviewMinor],["Rejected — reconcile",s.rejectedReviewMinor]]){
    const card=h("div",null,"thebe-cash-card");card.append(h("small",label),h("strong",p(number)));cards.append(card);
   }
   if(s.lastCountDate){
    const item=h("div",null,"thebe-cash-card");
    item.append(h("small","Last counted · "+s.lastCountDate),h("strong",p(s.lastCountedMinor)));
    cards.append(item);
    const difference=h("div",null,"thebe-cash-card");
    difference.append(h("small","Difference at last count"),h("strong",p(s.varianceAtLastCountMinor)));
    cards.append(difference);
   }
   const table=h("table"),thead=h("thead"),tr=h("tr");
   const caption=h("caption","Cash activity and manager review status");caption.className="thebe-cash-table-caption";table.append(caption);
   for(const title of ["Date","Type / purpose","Pula","Review"]){tr.append(h("th",title))}
   thead.append(tr);table.append(thead);
   const tbody=h("tbody");
   for(const item of data.items||[]){
    const row=h("tr");
    row.append(h("td",item.occurred_on),h("td",(item.kind==="advance"?"Cash issued":"Cash used")+" · "+item.purpose),
      h("td",(item.kind==="expense"?"−":"+")+p(item.amount_minor)),h("td",item.status+(item.review_note?" · "+item.review_note:"")));
    tbody.append(row);
   }
   if(!tbody.children.length){const row=h("tr"),cell=h("td","No cash activity yet.");cell.colSpan=4;row.append(cell);tbody.append(row)}
   table.append(tbody);tableHost.append(table);
   for(const item of data.counts||[]){
    const card=h("article",null,"thebe-cash-card");
    card.append(h("h4",item.report_date),h("p","Cash counted: "+p(item.counted_minor)),h("p","Review: "+item.status));
    if(item.review_note)card.append(h("p","Manager note: "+item.review_note));
    countHistory.append(card);
   }
   if(!countHistory.children.length)countHistory.append(h("p","No daily cash reports submitted yet."));
  }
  render(snapshot);
  async function refresh(){snapshot=await api("/public/employee/cash");render(snapshot)}
  let expenseKey=null;
  expense.addEventListener("input",()=>{expenseKey=null});
  expense.addEventListener("submit",async event=>{
   event.preventDefault();const amountMinor=cents(amount.value);
   if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>10000000){status.textContent="Enter a positive amount up to P100,000.";return}
   expenseKey=expenseKey||key();saveExpense.disabled=true;status.textContent="";
   try{
    await api("/public/employee/cash/expenses",{method:"POST",csrf:true,body:{amountMinor,category:category.value,purpose:purpose.value.trim(),
      receiptReference:receipt.value.trim(),jobReference:job.value.trim(),occurredOn:on.value,requestKey:expenseKey}});
    expense.reset();on.value=today();expenseKey=null;
    status.textContent="Cash expense submitted for manager review.";
    try{await refresh()}catch{status.textContent="Expense submitted, but activity could not reload. Refresh before submitting again."}
   }catch(e){status.textContent=String(e?.message||"Could not save expense. Retry with the same details.")}
   finally{saveExpense.disabled=false}
  });
  countForm.addEventListener("submit",async event=>{
   event.preventDefault();const countedMinor=cents(counted.value);
   if(!Number.isSafeInteger(countedMinor)||countedMinor<0||countedMinor>100000000){status.textContent="Enter the actual cash counted.";return}
   saveCount.disabled=true;status.textContent="";
   try{
    await api("/public/employee/cash/counts",{method:"POST",csrf:true,body:{countedMinor,reportDate:countDate.value,note:countNote.value}});
    countForm.reset();countDate.value=today();
    status.textContent="Cash count submitted. It is now locked for manager review.";
    try{await refresh()}catch{status.textContent="Cash count submitted, but activity could not reload. Refresh before submitting another count."}
   }catch(e){status.textContent=String(e?.message||"Cash count could not be submitted.")}
   finally{saveCount.disabled=false}
  });
  return true;
 }
 globalThis.ThebeEmployeeCash={mount};
})();
