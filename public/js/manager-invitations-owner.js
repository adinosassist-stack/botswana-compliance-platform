// Issue #2578: unmounted owner-only manager invitation view.
// Mount only after a protected server route is implemented and verified.
const MANAGER_INVITE_BRANCHES=Object.freeze(['Gaborone','Mahalapye','Palapye','Francistown','Maun']);
function normalizeManagerEmail(value){const email=String(value||'').trim().toLowerCase();if(email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))throw new TypeError('invalid_email');return email;}
export function mountManagerInvites({container,request,ownerConfirmed=false}={}){
  if(!container||typeof container.replaceChildren!=='function'||typeof request!=='function')
    throw new TypeError('manager_invite_dependencies_required');
  if(ownerConfirmed!==true)throw new Error('owner_authorization_required');
  const doc=container.ownerDocument;
  const make=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
  const heading=make('h2','Managers');const intro=make('p','Invite a manager using a private one-time activation link.');
  const form=make('form');const email=make('input');email.type='email';email.required=true;email.maxLength=254;email.autocomplete='email';email.placeholder='Manager email';
  const select=make('select');select.required=true;select.setAttribute('aria-label','Branch');
  const blank=make('option','Select a branch');blank.value='';select.append(blank);
  for(const branch of MANAGER_INVITE_BRANCHES){const opt=make('option',branch);opt.value=branch;select.append(opt);}
  const submit=make('button','Create invitation');submit.type='submit';
  const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(email,select,submit,status);container.replaceChildren(heading,intro,form);
  const submitInvite=async event=>{
    event.preventDefault();submit.disabled=true;status.textContent='Preparing invitation…';
    try{
      const address=normalizeManagerEmail(email.value);
      if(!MANAGER_INVITE_BRANCHES.includes(select.value))throw new Error('invalid_branch');
      // The real authenticated request must supply CSRF token from the host API client.
      // The host request must fail closed until the protected route exists.
      const result=await request({email:address,branch:select.value});
      if(!result||result.ok!==true)throw new Error('invite_not_confirmed');
      status.textContent='Invitation created. Send the private activation link securely to the manager.';
      email.value='';select.value='';
    }catch{status.textContent='Invitation not created. Check details or contact the owner.';}
    finally{submit.disabled=false;}
  };
  form.addEventListener('submit',submitInvite);
  return ()=>form.removeEventListener('submit',submitInvite);
}
