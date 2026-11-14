/* Thebe Life private-beta transport adapter.
 * Opt-in only, never loaded automatically by the app shell.
 * This is a UI transport, not an authorization decision. The server must
 * verify session entitlement, group membership and request Origin.
 */
(function(global){
  'use strict';
  const ID=/^[A-Za-z0-9_-]{1,80}$/;
  const blocked=reason=>Object.freeze({ok:false,reason});
  const minor=(v)=>Number.isSafeInteger(v)&&v>=0;
  const client=()=>global.BW?.api?.createClient?.({retries:0,timeoutMs:8000})||null;
  const transport=(api,requestUrl,signal)=>api.request(requestUrl,{
    method:'GET',signal,cache:'no-store'
  });
  async function loadGroup({groupId,enabled=false,signal}={}){
    if(enabled!==true)return blocked('private_beta_disabled');
    if(typeof groupId!=='string'||!ID.test(groupId))return blocked('invalid_group_id');
    const api=client();
    if(!api||typeof api.request!=='function')return blocked('transport_unavailable');
    // Same-origin relative URLs only. Never accept caller-supplied hostnames
    // or send personal credentials to another origin.
    const base='/api/life/motshelo/'+encodeURIComponent(groupId)+'/';
    try{
      // Only the canonical API client can perform authenticated requests.
      const [summary,history]=await Promise.all([
        transport(api,base+'summary',signal),
        transport(api,base+'contributions',signal)
      ]);
      if(summary?.ok!==true||summary.groupId!==groupId||
        !minor(summary.memberCount)||!minor(summary.reportedMinor)||
        !minor(summary.matchedMinor)||!minor(summary.clearedMinor)||
        summary.clearedMinor>summary.matchedMinor||summary.matchedMinor>summary.reportedMinor||
        !Array.isArray(history?.records)||history.records.length>50||history.groupId!==groupId||
        history.paymentExecutionEnabled!==false||summary.paymentExecutionEnabled!==false||
        summary.bankVerified!==false||summary.availableToDisburseMinor!==null)
        return blocked('invalid_private_beta_response');
      const contributions=[];
      for(const item of history.records){
        if(!item||!ID.test(item.id)||!ID.test(item.memberId)||
          !minor(item.reportedMinor)||!minor(item.matchedMinor)||!minor(item.clearedMinor)||
          item.clearedMinor>item.matchedMinor||item.matchedMinor>item.reportedMinor||
          item.currency!=='BWP'||item.bankVerified!==false)
          return blocked('invalid_private_beta_response');
        contributions.push(Object.freeze({
          id:item.id,memberId:item.memberId,reportedMinor:item.reportedMinor,
          matchedMinor:item.matchedMinor,clearedMinor:item.clearedMinor,
          bankVerified:false
        }));
      }
      return Object.freeze({ok:true,source:'private_beta_read_only',
        groupId,memberCount:summary.memberCount,
        reportedMinor:summary.reportedMinor,matchedMinor:summary.matchedMinor,
        clearedMinor:summary.clearedMinor,bankVerified:false,
        availableToDisburseMinor:null,paymentExecutionEnabled:false,
        contributions:Object.freeze(contributions)});
    }catch(error){
      if(error?.status===401)return blocked('unauthenticated');
      if(error?.status===403||error?.status===404)return blocked('not_authorized_or_unavailable');
      return blocked('private_beta_unavailable');
    }
  }
  global.ThebeLifePrivateReadClient=Object.freeze({loadGroup});
})(window);
