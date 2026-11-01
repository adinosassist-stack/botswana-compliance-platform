export function qualifyStagingAuth({bindings,publicEnabled,previewsEnabled,rows}) {
  if(publicEnabled!==false||previewsEnabled!==false)return {ok:false,reason:"public_access"};
  const db=bindings.filter(x=>x.name==="DB"&&x.type==="d1");
  const limiter=bindings.filter(x=>x.name==="GENERAL_AI_RATE_LIMITER"&&x.type==="ratelimit");
  if(db.length!==1||db[0].database_id!=="ff229eef-7724-49ae-9d68-d3a1db669b63")return {ok:false,reason:"database_isolation"};
  if(limiter.length!==1||limiter[0].namespace_id!=="78212078")return {ok:false,reason:"rate_limit_isolation"};
  if(!Number.isFinite(limiter[0].simple?.limit)||limiter[0].simple.limit>5||limiter[0].simple.period!==60)return {ok:false,reason:"rate_limit_policy"};
  if(!rows||rows.users!==0||rows.memberships!==0||rows.sessions!==0)return {ok:false,reason:"unexpected_test_identity"};
  return {ok:true,private:true,emptyAuth:true};
}