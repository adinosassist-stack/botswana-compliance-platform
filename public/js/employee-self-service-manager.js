/** Manager-only People panel. Self-service remains hidden when server feature is off. */
const make=(doc,tag,content,cls)=>{
 const node=doc.createElement(tag);
 if(content!==undefined&&content!==null)node.textContent=String(content);
 if(cls)node.className=cls;
 return node;
};
const field=(doc,labelText,node)=>{
 const label=make(doc,"label",labelText);label.append(node);return label;
};
function errorText(error){return String(error?.message||"Unable to save. Please retry.").slice(0,250)}
export async function mountStaffManager(host,{client}={}){
 if(!host||!client)return false;
 let initial;
 try{initial=await client.request("/api/employee-self-service/tasks")}
 catch{return false}
 const doc=host.ownerDocument;const section=make(doc,"section",null,"thebe-staff-manager");
 const css=doc.createElement("link");css.rel="stylesheet";css.href="/assets/employee-self-service.css?v=1";
 if(!doc.querySelector('link[href="/assets/employee-self-service.css?v=1"]'))doc.head.append(css);
 section.append(make(doc,"h3","Employee work & approvals"));
 section.append(make(doc,"p","Assign tasks, invite staff to their own secure portal, and approve submitted work. No payroll or employment decisions run automatically."));
 const status=make(doc,"p","",null);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const forms=make(doc,"div",null,"thebe-staff-manager__forms");
 const employees=await client.request("/api/employees").catch(()=>({items:[]}));
 const roster=Array.isArray(employees?.items)?employees.items:[];
 const createSelect=()=>{
  const select=make(doc,"select");
  for(const employee of roster){
   const option=make(doc,"option",employee.full_name||"Employee");
   option.value=String(employee.id||"");select.append(option);
  }
  return select;
 };
 const inviteForm=make(doc,"form");inviteForm.append(make(doc,"h4","1. Invite employee"));
 const inviteEmployee=createSelect(),email=make(doc,"input");email.type="email";email.placeholder="employee@example.com";email.required=true;
 inviteForm.append(field(doc,"Employee",inviteEmployee),field(doc,"Private work email",email));
 const inviteButton=make(doc,"button","Create 48-hour invitation");inviteButton.type="submit";inviteForm.append(inviteButton);
 const inviteLink=make(doc,"input");inviteLink.type="text";inviteLink.readOnly=true;inviteLink.setAttribute("aria-label","Private employee invitation link");
 const copy=make(doc,"button","Copy invite link","thebe-staff-secondary");copy.type="button";copy.addEventListener("click",async()=>{
  if(!inviteLink.value)return;
  try{await navigator.clipboard.writeText(inviteLink.value);status.textContent="Invitation link copied. Send it securely to the intended employee."}
  catch{inviteLink.focus();inviteLink.select();status.textContent="Copy the selected invitation link."}
 });
 inviteLink.hidden=true;copy.hidden=true;inviteForm.append(inviteLink,copy);
 const revokeAccess=make(doc,"button","Revoke employee access","thebe-staff-secondary");
 revokeAccess.type="button";
 revokeAccess.addEventListener("click",async()=>{
  if(!inviteEmployee.value||!globalThis.confirm("Revoke this employee's login sessions and unused invitations?"))return;
  revokeAccess.disabled=true;status.textContent="";
  try{
   await client.request("/api/employee-self-service/employees/"+encodeURIComponent(inviteEmployee.value)+"/revoke",{method:"POST",body:"{}"});
   inviteLink.value="";inviteLink.hidden=true;copy.hidden=true;
   status.textContent="Employee portal access revoked and active sessions closed.";
  }catch(error){status.textContent=errorText(error)}
  finally{revokeAccess.disabled=false}
 });
 inviteForm.append(revokeAccess);
 const taskForm=make(doc,"form");taskForm.append(make(doc,"h4","2. Assign work"));
 const taskEmployee=createSelect(),title=make(doc,"input"),detail=make(doc,"textarea"),due=make(doc,"input");
 title.required=true;title.minLength=3;title.maxLength=160;title.placeholder="Task title";
 detail.maxLength=1500;detail.rows=3;detail.placeholder="Instructions";
 due.type="date";
 taskForm.append(field(doc,"Employee",taskEmployee),field(doc,"Task title",title),field(doc,"Instructions",detail),field(doc,"Due date (optional)",due));
 const assignButton=make(doc,"button","Assign task");assignButton.type="submit";taskForm.append(assignButton);
 forms.append(inviteForm,taskForm);section.append(forms,status);
 const reviewHeading=make(doc,"h4","Assigned tasks");reviewHeading.style.marginTop="20px";section.append(reviewHeading);
 const list=make(doc,"div");section.append(list);
 const refresh=async()=>{
  const data=await client.request("/api/employee-self-service/tasks");
  const items=Array.isArray(data?.items)?data.items:[];
  list.replaceChildren();
  if(!items.length){list.append(make(doc,"p","No employee tasks yet."));return}
  for(const item of items){
   const row=make(doc,"div",null,"thebe-staff-manager__task");
   const name=make(doc,"strong",(item.employee_name||"Employee")+" · "+(item.title||"Task"));
   const state=make(doc,"small"," · "+String(item.status||"assigned").replaceAll("_"," "));
   row.append(name,state);
   if(item.due_date)row.append(make(doc,"div","Due "+item.due_date));
   if(item.latest_note)row.append(make(doc,"p",(item.latest_note_actor==="employee"?"Employee note: ":"Manager note: ")+String(item.latest_note),"thebe-staff-task__note"));
   if(item.status==="submitted"){
    const note=make(doc,"textarea");note.maxLength=500;note.rows=2;note.placeholder="Review note (required when returning)";
    row.append(note);
    const buttons=make(doc,"div",null,"thebe-staff-manager__actions");
    for(const [action,label] of [["approve","Approve completed work"],["return","Return for changes"]]){
     const button=make(doc,"button",label,action==="return"?"thebe-staff-secondary":null);button.type="button";
     button.addEventListener("click",async()=>{
      button.disabled=true;status.textContent="";
      try{await client.request("/api/employee-self-service/tasks/"+encodeURIComponent(item.id)+"/review",{method:"POST",body:JSON.stringify({decision:action,note:note.value})});
          status.textContent=action==="approve"?"Work approved.":"Task returned for further work.";await refresh()}
      catch(error){status.textContent=errorText(error);button.disabled=false;}
     });buttons.append(button);
    }
    row.append(buttons);
   }
   list.append(row);
  }
 };
 inviteForm.addEventListener("submit",async event=>{
  event.preventDefault();inviteButton.disabled=true;status.textContent="";
  try{
   const res=await client.request("/api/employee-self-service/invitations",{method:"POST",body:JSON.stringify({employeeId:inviteEmployee.value,email:email.value.trim()})});
   inviteLink.value=String(res.link||"");inviteLink.hidden=false;copy.hidden=false;
   status.textContent="Private invitation created; it expires after 48 hours. Share only with the named employee.";
  }catch(error){status.textContent=errorText(error)}
  finally{inviteButton.disabled=false}
 });
 taskForm.addEventListener("submit",async event=>{
  event.preventDefault();assignButton.disabled=true;status.textContent="";
  try{await client.request("/api/employee-self-service/tasks",{method:"POST",body:JSON.stringify({employeeId:taskEmployee.value,title:title.value.trim(),detail:detail.value,dueDate:due.value||null})});
      taskForm.reset();status.textContent="Task assigned.";await refresh()}
  catch(error){status.textContent=errorText(error)}
  finally{assignButton.disabled=false}
 });
 if(!roster.length){inviteButton.disabled=true;assignButton.disabled=true;status.textContent="Add an active employee before issuing access or assigning work."}
 host.replaceChildren(section);
 await refresh().catch(error=>{status.textContent=errorText(error)});
 return true;
}
