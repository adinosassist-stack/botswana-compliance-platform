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
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(activationLink);copy.textContent='Link copied';}
  catch{copy.textContent='Select and copy the link above';}
 });
}catch{
 target.textContent='You must sign in with an authorized owner account to invite managers.';
}
