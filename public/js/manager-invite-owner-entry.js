import {mountManagerInvites} from './manager-invitations-owner.js';
const target=document.querySelector('#invites'),link=document.querySelector('#secure-link'),copy=document.querySelector('#copy-link');
let activationLink='';
try{
 const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(!r.ok)throw Error('signin_required');
 const session=await r.json();
 if(session?.user?.role!=='owner'||!session?.csrfToken)throw Error('owner_required');
 mountManagerInvites({container:target,ownerConfirmed:true,request:async input=>{
  const result=await fetch('/api/workspace/managers/invitations',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(input)});
  if(!result.ok)throw Error('invitation_failed');
  const value=await result.json();const token=value?.invitation?.token;
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_invitation');
  // Fragment not sent to server. Never store token or send it to analytics.
  activationLink=location.origin+'/manager-invite/activate/#token='+token;
  link.textContent=activationLink;copy.hidden=false;
  return {ok:true};
 }});
 const directory=document.createElement('section');
 directory.setAttribute('aria-label','Manager accounts and branch assignments');
 target.after(directory);
 async function refreshDirectory(){
  directory.replaceChildren();
  const heading=document.createElement('h2');heading.textContent='Existing manager access';directory.append(heading);
  const response=await fetch('/api/workspace/managers/directory',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('directory_unavailable');
  const data=await response.json();
  if(!data?.ok||!Array.isArray(data.invites)||!Array.isArray(data.locations)||!Array.isArray(data.grants))throw Error('invalid_directory');
  const list=document.createElement('ul');directory.append(list);
  const requestAction=async(path,body)=>{
   const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(body)});
   if(!response.ok)throw Error('action_failed');
   await refreshDirectory();
  };
  const button=(label,action)=>{
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.addEventListener('click',async()=>{b.disabled=true;try{await action()}catch{alert('Action could not be completed. Check owner access and reload.')}finally{b.disabled=false}});
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
    li.append(button('Suspend manager',async()=>{
     if(!confirm('Suspend this manager and end their workspace sessions?'))return;
     await requestAction('/api/workspace/managers/suspend',{managerUserId:userId});
    }));
   }
   list.append(li);
  }
  if(!data.invites.length){const empty=document.createElement('p');empty.textContent='No invitations yet.';directory.append(empty)}
 }
 try{await refreshDirectory()}catch{directory.textContent='Manager directory is unavailable. Invitations can still be created.';}
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(activationLink);copy.textContent='Link copied';}
  catch{copy.textContent='Select and copy the link above';}
 });
}catch{
 target.textContent='You must sign in with an authorized owner account to invite managers.';
}
