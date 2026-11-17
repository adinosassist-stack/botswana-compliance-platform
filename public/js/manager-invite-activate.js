// Staging-only manager activation page. Token exists in fragment, never in query,
// cookies, analytics or request logs. Never persist it in browser storage.
(()=>{
'use strict';
const form=document.querySelector('#activate-form'),status=document.querySelector('#status');
const button=document.querySelector('#activate-button');
const fragment=new URLSearchParams(location.hash.replace(/^#/,''));const token=fragment.get('token')||'';
history.replaceState(null,'',location.pathname);
if(!/^[a-f0-9]{64}$/.test(token)){
 status.textContent='This activation link is missing or invalid. Request a new link from the company owner.';
 form.hidden=true;return;
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const password=document.querySelector('#password').value,confirm=document.querySelector('#confirm').value;
 if(password!==confirm){status.textContent='Passwords do not match.';return}
 if(password.length<12||password.length>200){status.textContent='Use a password between 12 and 200 characters.';return}
 button.disabled=true;status.textContent='Activating account…';
 try{
  const res=await fetch('/api/auth/manager-invite/accept',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json'},body:JSON.stringify({token,password})});
  if(!res.ok)throw Error('activation_failed');
  form.hidden=true;status.textContent='Account activated. Sign in using your email and new password.';
 }catch{status.textContent='Activation was not completed. The invitation may have expired or already been used. Contact the owner.';}
 finally{button.disabled=false;document.querySelector('#password').value='';document.querySelector('#confirm').value='';}
});
})();
