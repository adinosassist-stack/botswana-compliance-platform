import {mountManagerInvites} from './manager-invitations-owner.js';
const target=document.querySelector('#invites'),link=document.querySelector('#secure-link'),copy=document.querySelector('#copy-link');
let activationLink='';
const api=window.BW?.api?.createClient?.({retries:0,getCsrfToken:()=>sessionCsrf});
let sessionCsrf='';
try{
 if(!api)throw Error('api_unavailable');
 const session=await api.request('/api/auth/me');
 if(session?.user?.role!=='owner'||!session?.csrfToken)throw Error('owner_required');
 sessionCsrf=session.csrfToken;
 mountManagerInvites({container:target,ownerConfirmed:true,request:async input=>{
  const value=await api.request('/api/workspace/managers/invitations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  const token=value?.invitation?.token;
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_invitation');
  // Fragment not sent to server. Never store token or send it to analytics.
  activationLink=location.origin+'/manager-invite/activate/#token='+token;
  link.textContent=activationLink;copy.hidden=false;
  try{await refreshDirectory()}catch{/* Invitation exists; directory can be refreshed separately. */}
  return {ok:true};
 }});
 const directory=document.createElement('section');
 directory.setAttribute('aria-label','Manager accounts and branch assignments');
 target.after(directory);
 async function refreshDirectory(){
  directory.replaceChildren();
  const heading=document.createElement('h2');heading.textContent='Existing manager access';directory.append(heading);
  const actionStatus=document.createElement('p');actionStatus.setAttribute('role','status');actionStatus.setAttribute('aria-live','polite');directory.append(actionStatus);
  const data=await api.request('/api/workspace/managers/directory');
  if(!data?.ok||!Array.isArray(data.invites)||!Array.isArray(data.locations)||!Array.isArray(data.grants))throw Error('invalid_directory');
  const list=document.createElement('ul');directory.append(list);
  const requestAction=async(path,body)=>{
   await api.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   await refreshDirectory();
  };
  const button=(label,action)=>{
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.addEventListener('click',async()=>{b.disabled=true;try{await action()}catch{actionStatus.textContent='Action could not be completed. Check owner access and reload.'}finally{b.disabled=false}});
   return b;
  };
  for(const invite of data.invites){
   const li=document.createElement('li');
   const label=document.createElement('span');
   label.textContent=String(invite.email||'Manager')+' — '+String(invite.branch||'')+' — '+String(invite.membership_status||invite.status||'unknown');
   li.append(label);
   if(invite.status==='pending'&&invite.id){
    li.append(button('Revoke invitation',()=>requestAction('/api/workspace/managers/invitations/revoke',{inviteId:invite.id})));
   }
   if(invite.status==='accepted'&&invite.membership_status==='active'&&invite.manager_user_id){
    const userId=String(invite.manager_user_id);
    const selected=document.createElement('select');selected.setAttribute('aria-label','Location for '+String(invite.email||'manager'));
    for(const location of data.locations){const opt=document.createElement('option');opt.value=String(location.id||'');opt.textContent=String(location.name||location.town||location.id);selected.append(opt)}
    if(data.locations.length){
     li.append(selected);
     li.append(button('Grant location',()=>requestAction('/api/workspace/managers/locations/grant',{managerId:userId,locationId:selected.value})));
     li.append(button('Revoke location',()=>requestAction('/api/workspace/managers/locations/revoke',{managerId:userId,locationId:selected.value})));
    }
    const assigned=data.grants.filter(g=>g.manager_user_id===userId&&g.status==='active').map(g=>
     data.locations.find(l=>l.id===g.location_id)?.name||String(g.location_id));
    const summary=document.createElement('span');summary.textContent=' Assigned: '+(assigned.join(', ')||'None');li.append(summary);
    const suspendButton=button('Suspend manager',async()=>{
     suspendButton.hidden=true;
     actionStatus.textContent='Confirm suspension to end this manager’s workspace sessions.';
     const confirmButton=button('Confirm suspension',()=>requestAction('/api/workspace/managers/suspend',{managerUserId:userId}));
     const cancelButton=button('Cancel suspension',()=>{
      confirmButton.remove();cancelButton.remove();suspendButton.hidden=false;
      actionStatus.textContent='Suspension cancelled.';
     });
     li.append(confirmButton,cancelButton);
    });
    li.append(suspendButton);
   }
   list.append(li);
  }
  if(!data.invites.length){const empty=document.createElement('p');empty.textContent='No invitations yet.';directory.append(empty)}
 }
 try{await refreshDirectory()}catch{directory.textContent='Manager directory is unavailable. Invitations can still be created.';}

 // Customer tenant owners can review requests from their own registered team.
 // An approval queues secure provisioning; it does not create manager permissions.
 const requestsSection=document.createElement('section');
 requestsSection.setAttribute('aria-label','Manager access requests');
 target.after(requestsSection);
 async function refreshAccessRequests(confirmation=''){
  let data;
  try{
   data=await api.request('/api/workspace/managers/access-requests/inbox');
   if(!data?.ok||!Array.isArray(data.requests))throw Error('requests_unavailable');
  }catch(error){
   if(!confirmation)throw error;
   requestsSection.replaceChildren();
   const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   message.textContent=confirmation+' The request list could not be refreshed. Reload before taking another action.';
   requestsSection.append(message);return;
  }
  requestsSection.replaceChildren();
  const h=document.createElement('h2');h.textContent='Manager access requests';requestsSection.append(h);
  const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent=confirmation;requestsSection.append(message);
  const list=document.createElement('ul');requestsSection.append(list);
  for(const item of data.requests){
   const li=document.createElement('li');
   const desc=document.createElement('span');desc.textContent=String(item.requester_email||'User')+' — '+String(item.status||'pending')+' — '+String(item.reason||'');li.append(desc);
   if(item.status==='pending')for(const [label,decision] of [['Approve for provisioning','approve'],['Reject','reject']]){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.addEventListener('click',async()=>{
     b.disabled=true;
     try{
      const result=await api.request('/api/workspace/managers/access-requests/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:item.id,decision})});
      if(!result?.ok||result.managerActive!==false)throw Error('unexpected_result');
      await refreshAccessRequests('Decision recorded. Manager access is not active until separately provisioned.');
     }catch{message.textContent='Could not review this request. Reload and try again.';b.disabled=false;}
    });li.append(b);
   }
   if(item.status==='approved_for_provisioning'){
    const provision=document.createElement('button');provision.type='button';
    provision.textContent='Provision manager (secure action)';
    provision.addEventListener('click',async()=>{
     provision.disabled=true;
     try{
      const result=await api.request('/api/workspace/managers/access-requests/provision',{
       method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({requestId:item.id})
      });
      if(!result?.ok||result.status!=='provisioned'||result.reauthenticationRequired!==true)throw Error('provision_unavailable');
      await refreshAccessRequests('Manager provisioned for the approved branch. They must sign in again.');
     }catch{message.textContent='Provisioning is not enabled or could not be completed. Contact your administrator.';provision.disabled=false;}
    });
    li.append(provision);
   }
   list.append(li);
  }
  if(!data.requests.length){const p=document.createElement('p');p.textContent='No requests yet.';requestsSection.append(p);}
 }
 const codeSection=document.createElement('section');codeSection.setAttribute('aria-label','Registered user access codes');target.after(codeSection);
  const codeTitle=document.createElement('h3');codeTitle.textContent='Invite registered users to request access';codeSection.append(codeTitle);
  const codeInfo=document.createElement('p');codeInfo.textContent='Choose a branch and generate a private request code. It expires after 48 hours and cannot grant access without your review and separate provisioning.';codeSection.append(codeInfo);
  const codeLocations=await api.request('/api/workspace/managers/directory');
  const codeSelect=document.createElement('select');codeSelect.setAttribute('aria-label','Branch for access request code');codeSection.append(codeSelect);
  for(const l of codeLocations.locations||[]){const op=document.createElement('option');op.value=String(l.id);op.textContent=String(l.name||l.town||'Branch');codeSelect.append(op);}
  const codeOutput=document.createElement('p');codeOutput.setAttribute('role','status');
  const generateCode=document.createElement('button');generateCode.type='button';generateCode.textContent='Create business request code';
  generateCode.addEventListener('click',async()=>{
    generateCode.disabled=true;
    try{
      const code=await api.request('/api/workspace/managers/access-requests/business-code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locationId:codeSelect.value})});
      if(!code?.ok||!(/^[a-f0-9]{64}$/).test(code.code))throw Error('code_unavailable');
      codeOutput.textContent='Private code (copy and send securely; do not post publicly): '+code.code+' — expires '+String(code.expiresAt||'')+'. Request page: '+location.origin+'/manager-invite/request/';
    }catch{codeOutput.textContent='Could not generate request code. Check owner permissions.';}finally{generateCode.disabled=false;}
  });codeSection.append(generateCode,codeOutput);
 try{await refreshAccessRequests()}catch{requestsSection.remove();/* Route not enabled in this environment. */}
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(activationLink);copy.textContent='Link copied';}
  catch{copy.textContent='Select and copy the link above';}
 });
}catch{
 target.textContent='You must sign in with an authorized owner account to invite managers.';
}
