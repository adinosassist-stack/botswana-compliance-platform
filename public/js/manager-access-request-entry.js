const status=document.querySelector('#status'),form=document.querySelector('#request-form'),branch=document.querySelector('#branch'),reason=document.querySelector('#reason'),history=document.querySelector('#previous'),send=document.querySelector('#send');
let csrf='';
const api=globalThis.BW?.api?.createClient?.({retries:0,getCsrfToken:()=>csrf});
const show=t=>{status.textContent=t;};
async function load(){
 if(!api)throw Error('service_unavailable');
 const session=await api.request('/api/auth/me');
 if(!session?.user||!['reviewer','auditor'].includes(session.user.role)||!session.csrfToken)throw Error('account_ineligible');
 csrf=session.csrfToken;
 const rows=await api.request('/api/workspace/managers/request-locations');
 if(!rows?.ok||!Array.isArray(rows.locations))throw Error('locations_unavailable');
 branch.replaceChildren();
 const blank=document.createElement('option');blank.value='';blank.textContent='Select branch';branch.append(blank);
 for(const item of rows.locations){const option=document.createElement('option');option.value=String(item.id);option.textContent=String(item.name||item.town||'Branch');branch.append(option);}
 const prev=await api.request('/api/workspace/managers/access-requests/mine');
 history.replaceChildren();const h=document.createElement('h2');h.textContent='Your requests';history.append(h);
 for(const item of prev.requests||[]){const p=document.createElement('p');p.textContent=String(item.status||'pending')+' — '+String(item.created_at||'');history.append(p);}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();send.disabled=true;show('Submitting…');
 try{const response=await api.request('/api/workspace/managers/access-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locationId:branch.value,reason:reason.value})});
 if(!response?.ok)throw Error('not_confirmed');
 show('Your request was sent to your business owner for review. Manager access remains inactive.');await load();
 }catch{show('Request could not be sent. Check your account and try again.');}
 finally{send.disabled=false;}
});
try{await load();show('Select a branch to request manager access.');}catch{form.hidden=true;show('Sign in with an eligible registered team-member account to request manager access.');}
