export function proxyTrustPolicy(value="0") {
  const raw=String(value??"0").trim();
  if(!/^[0-3]$/.test(raw)) return {ok:false,hops:0,expressValue:false};
  const hops=Number(raw);
  return {ok:true,hops,expressValue:hops===0?false:hops};
}
