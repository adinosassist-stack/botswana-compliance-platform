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
  const transport=(method,requestUrl,signal)=>global.fetch(requestUrl,{
    method,credentials:'same-origin',cache:'no-store',mode:'same-origin',
    redirect:'error',headers:{'accept':'application/json'},signal
  });
  async function loadGroup({groupId,enabled=false,signal}={}){
    if(enabled!==true)return blocked('private_beta_disabled');
    if(typeof groupId!=='string'||!ID.test(groupId))return blocked('invalid_group_id');
    if(typeof global.fetch!=='function')return blocked('transport_unavailable');
    // Same-origin relative URLs only. Never accept caller-supplied hostnames
    // or send personal credentials to another origin.
    const base='/api/life/motshelo/'+encodeURIComponent(groupId)+'/';
    try{
      const [summaryResponse,historyResponse]=await Promise.all([
        transport('GET',base+'summary',signal),
        transport('GET',base+'contributions',signal)
      ]);
      if(summaryResponse.status===401||historyResponse.status===401)return blocked('unauthenticated');
      if([403,404].includes(summaryResponse.status)||[403,404].includes(historyResponse.status))return blocked('not_authorized_or_unavailable');
      if(!summaryResponse.ok||!historyResponse.ok)return blocked('private_beta_unavailable');
      const [summary,history]=await Promise.all([summaryResponse.json(),historyResponse.json()]);
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
    }catch{
      return blocked('private_beta_unavailable');
    }
  }
  global.ThebeLifePrivateReadClient=Object.freeze({loadGroup});
})(window);
