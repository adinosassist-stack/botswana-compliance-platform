(()=>{
"use strict";
const byId=id=>document.getElementById(id);
// Staff APIs are deliberately independent of the owner workspace client and its
// canonical-production redirect, so an isolated staging origin can be tested safely.
const STAFF_PATH=/^\/public\/employee\/(?:accept|login|logout|me|tasks(?:\/[a-f0-9-]{32,36}\/progress)?)$/i;
let staffCsrf="";
const api=async(path,{method="GET",body=null,csrf=false}={})=>{
 if(!STAFF_PATH.test(String(path||"")))throw Error("Unsupported employee service route.");
 const current=new URL(location.href),url=new URL(path,current.origin);
 if(url.origin!==current.origin)throw Error("Cross-origin employee access is blocked.");
 if(current.protocol!=="https:"&&!["localhost","127.0.0.1","::1"].includes(current.hostname.toLowerCase()))throw Error("Employee sign-in requires a secure connection.");
 const headers={"accept":"application/json"};
 if(body!==null)headers["content-type"]="application/json";
 if(csrf)headers["x-staff-csrf"]=staffCsrf;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(url.href,{method,headers,credentials:"same-origin",redirect:"error",mode:"same-origin",cache:"no-store",referrerPolicy:"no-referrer",signal:controller.signal,...(body!==null?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=new Error(response.status===429?"Too many attempts. Try again later.":response.status===503?"The employee service is temporarily unavailable.":"This action could not be completed. Please retry.");
   error.code=String(data?.error||"request_failed");error.status=response.status;
   throw error;
  }
  return data;
 }catch(error){
  if(error?.name==="AbortError")throw Error("The connection timed out. Please retry.");
  throw error;
 }finally{clearTimeout(timeout)}
};
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
const message=text=>{const n=byId("staffGlobalMessage");n.textContent=String(text||"");n.hidden=!text};
const panel=which=>{for(const id of ["staffInvite","staffLogin","staffDashboard"])byId(id).hidden=id!==which};
const setBusy=(form,busy)=>{for(const button of form.querySelectorAll("button"))button.disabled=busy};
const failure=error=>["invalid_credentials","unauthenticated"].includes(error?.code)?"Check your details and sign in again.":String(error?.message||"This action could not be completed. Please retry.");
function renderTask(item){
 const task=element("article","thebe-staff-task");
 const top=element("div","thebe-staff-task__top"),heading=element("h2",null,item.title||"Assigned task");
 const status=element("span","thebe-staff-pill",String(item.status||"assigned").replaceAll("_"," "));
 top.append(heading,status);task.append(top);
 if(item.detail)task.append(element("p",null,item.detail));
 if(item.latest_note)task.append(element("p","thebe-staff-task__note",(item.latest_note_actor==="manager"?"Manager note: ":"Progress note: ")+String(item.latest_note)));
 const meta=element("div","thebe-staff-task__meta",(item.due_date?"Due "+item.due_date+" · ":"")+"Priority "+String(item.priority||2));
 task.append(meta);
 if(item.status==="assigned"||item.status==="in_progress"){
  const actions=element("div","thebe-staff-task__actions");
  const action=item.status==="assigned"?"start":"submit",button=element("button",null,item.status==="assigned"?"Start task":"Submit for review");
  button.type="button";
  const note=element("textarea");note.maxLength=500;note.rows=2;note.placeholder="Progress or handover note (optional)";
  actions.append(note,button);
  button.addEventListener("click",async()=>{
   button.disabled=true;message("");
   try{await api("/public/employee/tasks/"+encodeURIComponent(item.id)+"/progress",{method:"POST",csrf:true,body:{action,note:note.value}});
       message(action==="submit"?"Task submitted for manager review.":"Task started.");await refreshTasks();
   }catch(error){message(failure(error));button.disabled=false;}
  });
  task.append(actions);
 }else if(item.status==="submitted")task.append(element("p",null,"Waiting for your manager to review this work."));
 else if(item.status==="completed")task.append(element("p",null,"Approved and completed."));
 return task;
}
async function refreshTasks(){
 const list=byId("staffTasksList");list.replaceChildren();byId("staffTasksStatus").textContent="Loading assigned tasks…";
 try{
  const response=await api("/public/employee/tasks");const items=Array.isArray(response?.items)?response.items:[];
  let open=0,pending=0,done=0;
  for(const item of items){
   if(item.status==="submitted")pending++;else if(item.status==="completed")done++;else open++;
   list.append(renderTask(item));
  }
  byId("staffOpenCount").textContent=String(open);
  byId("staffPendingCount").textContent=String(pending);
  byId("staffCompletedCount").textContent=String(done);
  byId("staffTasksStatus").textContent=items.length?"": "No work has been assigned yet.";
 }catch(error){byId("staffTasksStatus").textContent=failure(error)}
}
async function showDashboard(){
 const info=await api("/public/employee/me");staffCsrf=String(info.csrfToken||"");
 if(!staffCsrf)throw Error("Your session cannot be verified.");
 byId("staffWelcome").textContent="Hello, "+String(info.employee?.name||"employee");
 byId("staffCompany").textContent=String(info.companyName||"")+" · Personal employee workspace";
 panel("staffDashboard");await refreshTasks();
}
async function bootstrap(){
 const url=new URL(location.href);
 const tenant=url.searchParams.get("tenant")||"";
 if(tenant)byId("staffTenantId").value=tenant;
 const invite=location.hash.startsWith("#invite=")?location.hash.slice(8):"";
 if(invite){panel("staffInvite");return;}
 try{await showDashboard()}catch{panel("staffLogin")}
}
document.addEventListener("DOMContentLoaded",()=>{
 const form=byId("staffInviteForm");
 form.addEventListener("submit",async event=>{
  event.preventDefault();message("");
  const password=byId("staffInvitePassword").value,confirm=byId("staffInviteConfirm").value;
  if(password!==confirm){message("Passwords do not match.");return;}
  const token=location.hash.startsWith("#invite=")?location.hash.slice(8):"";
  if(!/^[a-f0-9]{64}$/.test(token)){message("This invitation link is incomplete.");return;}
  setBusy(form,true);
  try{
   const response=await api("/public/employee/accept",{method:"POST",body:{token,password}});
   byId("staffTenantId").value=String(response.tenantId||"");
   byId("staffEmail").value=String(response.email||"");
   form.reset();history.replaceState(null,"",location.pathname+"?tenant="+encodeURIComponent(response.tenantId||""));
   panel("staffLogin");message("Account activated. Sign in using your new password.");
  }catch(error){message(failure(error))}
  finally{setBusy(form,false)}
 });
 const loginForm=byId("staffLoginForm");
 loginForm.addEventListener("submit",async event=>{
  event.preventDefault();setBusy(loginForm,true);message("");
  try{
   const tenantId=byId("staffTenantId").value.trim(),email=byId("staffEmail").value.trim(),password=byId("staffPassword").value;
   await api("/public/employee/login",{method:"POST",body:{tenantId,email,password}});
   byId("staffPassword").value="";
   history.replaceState(null,"",location.pathname+"?tenant="+encodeURIComponent(tenantId));
   await showDashboard();
  }catch(error){message(failure(error))}
  finally{setBusy(loginForm,false)}
 });
 byId("staffSignOut").addEventListener("click",async()=>{
  const button=byId("staffSignOut");button.disabled=true;message("");
  try{
   await api("/public/employee/logout",{method:"POST",csrf:true});
   staffCsrf="";panel("staffLogin");message("Signed out.");
  }catch(error){message("Sign-out could not be confirmed. Your session may still be active; please retry.")}
  finally{button.disabled=false}
 });
 bootstrap();
});
})();
