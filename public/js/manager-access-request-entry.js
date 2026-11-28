const status=document.querySelector('#status'),form=document.querySelector('#request-form'),branch=document.querySelector('#branch'),reason=document.querySelector('#reason'),history=document.querySelector('#previous'),send=document.querySelector('#send'),businessCode=document.querySelector('#business-code');
let csrf='';
const api=globalThis.BW?.api?.createClient?.({retries:0,getCsrfToken:()=>csrf});
const show=t=>{status.textContent=t;};
async function load(){
 if(!api)throw Error('service_unavailable');
 const session=await api.request('/api/auth/me');
 if(!session?.user||!session.csrfToken)throw Error('account_ineligible');
 csrf=session.csrfToken;
 let rows={locations:[]};
 if(['reviewer','auditor'].includes(session.user.role)){rows=await api.request('/api/workspace/managers/request-locations');if(!rows?.ok||!Array.isArray(rows.locations))throw Error('locations_unavailable');}
 branch.replaceChildren();
 const blank=document.createElement('option');blank.value='';blank.textContent='Select branch';branch.append(blank);
 for(const item of rows.locations){const option=document.createElement('option');option.value=String(item.id);option.textContent=String(item.name||item.town||'Branch');branch.append(option);}
 const prev=await api.request('/api/workspace/managers/access-requests/mine');
 history.replaceChildren();const h=document.createElement('h2');h.textContent='Your requests';history.append(h);
 for(const item of prev.requests||[]){const p=document.createElement('p');p.textContent=String(item.status||'pending')+' — '+String(item.created_at||'');history.append(p);}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(send.disabled)return;
 const code=businessCode.value.trim();
 if(code&&!/^[a-f0-9]{64}$/.test(code)){show('Enter the complete business request code shared by its owner.');return;}
 if(!code&&!branch.value){show('Enter a business request code or select your existing business branch.');return;}
 send.disabled=true;show('Submitting…');
 const payload={...(code?{businessCode:code}:{locationId:branch.value}),reason:reason.value};
 try{const response=await api.request('/api/workspace/managers/access-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 if(!response?.ok)throw Error('not_confirmed');
 businessCode.value='';
 show('Your request was sent to your business owner for review. Manager access remains inactive.');
 try{await load();}catch{show('Your request was sent. Request history could not be refreshed; reload to check its status. Manager access remains inactive.');}
 }catch{show('Request could not be sent. Check your account and try again.');}
 finally{send.disabled=false;}
});
try{await load();show('Enter the business request code shared by its owner, or choose your existing business branch.');}catch{form.hidden=true;show('Sign in to a registered Thebe Desk account to request manager access.');}
