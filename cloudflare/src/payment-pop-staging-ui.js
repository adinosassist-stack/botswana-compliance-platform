// Standalone, same-origin staging UI. No local/session storage or external scripts.
export function bootstrapPopUi(){
 const $=id=>document.getElementById(id),status=$('status');let user=null,csrf='',epoch=0,busy=false,key=crypto.randomUUID();
 const requests=new Set();
 function message(text){status.textContent=text}
 function controls(){
  $('session').textContent=user?'Signed in: '+user.email:'Not signed in';
  $('upload').hidden=!user;$('review').hidden=user?.platformBillingAdmin!==true;
  $('login').hidden=!!user;$('logout').hidden=!user;
  for(const button of document.querySelectorAll('button'))button.disabled=busy;
  $('logout').disabled=false;
 }
 async function api(path,{method='GET',body,headers={}}={}){
  const controller=new AbortController();requests.add(controller);
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(path,{method,credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,
    headers:{accept:'application/json',...(method==='POST'?{'x-csrf-token':csrf}:{}),...headers},...(body!==undefined?{body}:{})});
   const data=await response.json();
   if(!response.ok)throw Error(response.status===401?'Sign in again.':response.status===403?'This action is not permitted.':response.status===409?'Request state changed. Refresh the receipt list before retrying.':response.status===413?'The receipt exceeds the upload size limit.':'The service could not confirm completion. Refresh before retrying; payment is not confirmed.');
   return data;
  }finally{clearTimeout(timer);requests.delete(controller)}
 }
 async function operation(action){if(busy)return;const revision=epoch;busy=true;controls();
  try{await action(revision)}catch(error){if(revision===epoch)message(error.name==='AbortError'?'Request stopped. Refresh to confirm its server state.':error.message)}
  finally{if(revision===epoch){busy=false;controls()}}
 }
 async function session(){const revision=epoch;try{const data=await api('/api/auth/me');if(revision!==epoch)return;user=data.user;csrf=data.csrfToken||'';controls()}catch{if(revision===epoch){user=null;csrf='';controls()}}}
 $('login').addEventListener('submit',event=>{event.preventDefault();if(busy)return;epoch++;void operation(async revision=>{
  const password=$('password').value;$('password').value='';
  const result=await api('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password})});
  if(revision!==epoch)return;csrf=result.csrfToken||'';await session();if(revision===epoch)message(user?'Signed in. Receipt review does not confirm bank funds.':'Sign-in could not be confirmed. Sign in again.');
 })});
 $('logout').addEventListener('click',()=>{const token=csrf;epoch++;for(const controller of requests)controller.abort();
  user=null;csrf='';busy=false;key=crypto.randomUUID();$('file').value='';for(const id of ['order','reviewOrder','email','password'])$(id).value='';$('receipts').replaceChildren();controls();message('Signed out locally. Revoking the server session…');
  void api('/api/auth/logout',{method:'POST',headers:{'x-csrf-token':token}}).then(()=>message('Signed out.')).catch(()=>message('Server sign-out could not be confirmed. Close this session and sign in again before further work.'));
 });
 for(const id of ['file','order'])$(id).addEventListener('change',()=>{key=crypto.randomUUID()});
 $('upload').addEventListener('submit',event=>{event.preventDefault();void operation(async revision=>{
  const file=$('file').files?.[0];if(!file||file.size<8||file.size>3670016)throw Error('Choose a PDF, PNG or JPEG receipt up to 3.5 MiB.');
  const result=await api('/api/payments/manual-bank/pop/upload',{method:'POST',body:file,headers:{'content-type':file.type,'x-pop-order-id':$('order').value.trim(),'x-pop-filename':file.name,'idempotency-key':key}});
  if(revision!==epoch)return;key=crypto.randomUUID();$('file').value='';
  message('Receipt '+result.documentId+' is quarantined for scanning. Your plan remains unchanged until matching bank funds are verified.');
 })});
 async function loadReceipts(revision){
  const result=await api('/api/platform/billing/pop/receipts?'+new URLSearchParams({orderId:$('reviewOrder').value.trim()}));
  if(revision!==epoch)return;$('receipts').replaceChildren();
  if(!result.items?.length){message('No receipts returned for this order.');return}
  for(const row of result.items){
   const item=document.createElement('li'),label=document.createElement('p');label.textContent=row.display_name+' · '+row.scan_status;item.append(label);
   const scope={documentId:row.id,tenantId:row.tenant_id,orderId:row.payment_order_id};
   if(row.scan_status==='clean'){
    const link=document.createElement('a');link.textContent='Download scanned receipt';link.href='/api/platform/billing/pop/download?'+new URLSearchParams(scope);link.download='';item.append(link);
   }
   if(row.scan_status==='pending'){
    const scan=document.createElement('button');scan.type='button';scan.textContent='Scan receipt';
    scan.addEventListener('click',()=>void operation(async next=>{await api('/api/platform/billing/pop/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(scope)});await loadReceipts(next)}));item.append(scan);
   }
   const retire=document.createElement('button');retire.type='button';retire.textContent='Retire receipt';
   retire.addEventListener('click',()=>{const reason=prompt('Reason for retiring this isolated staging receipt:');if(!reason?.trim()||!confirm('Retire and remove this receipt from private staging storage?'))return;
    void operation(async next=>{await api('/api/platform/billing/pop/retire',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,expectedSha256:row.content_sha256,expectedEtag:row.object_etag,reason})});await loadReceipts(next)});
   });item.append(retire);$('receipts').append(item);
  }
  message('Receipt status loaded. Clean files are not proof of cleared bank funds.');
 }
 $('review').addEventListener('submit',event=>{event.preventDefault();void operation(loadReceipts)});
 controls();void session();
}
export function popStagingPage(){
 const nonce=crypto.randomUUID().replaceAll('-','');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Thebe receipt qualification</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#20242b;font:16px system-ui}main{max-width:760px;margin:auto;padding:24px}section,form{background:white;padding:20px;border:1px solid #d8dde5;border-radius:12px;margin:16px 0}h1{font-size:26px}label{display:block;margin:12px 0}input{display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #9fa9b8;border-radius:6px;font:inherit}button,a{display:inline-block;margin:6px 8px 6px 0;padding:12px;border-radius:6px;font:inherit}button{background:#253347;color:white;border:0;cursor:pointer}button:disabled{opacity:.5}li{margin:14px 0;padding:10px;border-bottom:1px solid #dde2ea}#status{min-height:48px;overflow-wrap:anywhere}[hidden]{display:none!important}</style></head><body><main>
<p>ISOLATED STAGING · synthetic receipts only</p><h1>Receipt qualification</h1><p>Uploading or scanning a receipt never confirms payment or activates a subscription.</p><p id="session">Checking session…</p><button id="logout" hidden>Sign out</button><p id="status" role="status" aria-live="polite"></p>
<form id="login"><h2>Sign in</h2><label>Email<input id="email" type="email" autocomplete="username" required></label><label>Password<input id="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form>
<form id="upload" hidden><h2>Submit a receipt</h2><label>Payment order ID<input id="order" required></label><label>PDF, PNG or JPEG · up to 3.5 MiB<input id="file" type="file" accept="application/pdf,image/png,image/jpeg" required></label><button>Upload to quarantine</button></form>
<form id="review" hidden><h2>Platform owner review</h2><label>Payment order ID<input id="reviewOrder" required></label><button>Load receipts</button><ul id="receipts"></ul></form></main><script nonce="${nonce}">(${bootstrapPopUi.toString()})();</script></body></html>`;
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff',
  'content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  'referrer-policy':'no-referrer'}});
}
