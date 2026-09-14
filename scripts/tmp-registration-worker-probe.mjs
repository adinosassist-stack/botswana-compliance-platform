const enc=new TextEncoder();
function b64(bytes){return btoa(String.fromCharCode(...bytes))}
async function hashPassword(value){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256);
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

export default {
  async fetch(request,env){
    if(new URL(request.url).pathname!=='/probe')return new Response('not found',{status:404});
    const suffix=`${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
    const email=`worker-registration-${suffix}@example.invalid`;
    const companyName=`Worker Registration QA ${suffix}`;
    const userId=crypto.randomUUID(),tenantId=crypto.randomUUID();
    const result={stages:[]};
    try{
      const before=await env.DB.prepare('SELECT count(*) count FROM users').first();
      result.beforeUsers=Number(before?.count||0);result.stages.push('count_before');
      const ph=await hashPassword('Thebe-Worker-Registration-Probe!9');
      result.hashPrefix=ph.slice(0,14);result.stages.push('hash');
      const exists=await env.DB.prepare('SELECT 1 ok FROM users WHERE email=? LIMIT 1').bind(email).first();
      result.exists=!!exists;result.stages.push('exists_lookup');
      const statements=[
        env.DB.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').bind(tenantId,companyName),
        env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)').bind(userId,email,'worker-registration',ph),
        env.DB.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").bind(tenantId,userId),
        env.DB.prepare("INSERT INTO subscriptions(tenant_id,plan,status,trial_ends_at) VALUES(?,?,'trialing',datetime('now','+14 days'))").bind(tenantId,'business')
      ];
      const batch=await env.DB.batch(statements);result.batchChanges=batch.map(x=>Number(x?.meta?.changes||0));result.stages.push('batch');
      const persisted=await env.DB.prepare(`SELECT m.role,m.status membership_status,s.plan,s.status subscription_status FROM memberships m JOIN subscriptions s ON s.tenant_id=m.tenant_id WHERE m.user_id=? LIMIT 1`).bind(userId).first();
      result.persisted=persisted||null;result.stages.push('verify');
      result.ok=!!persisted&&persisted.role==='owner'&&persisted.membership_status==='active'&&persisted.subscription_status==='trialing';
    }catch(error){
      result.ok=false;result.failedStage=result.stages.at(-1)||'startup';result.errorName=String(error?.name||'');result.errorMessage=String(error?.message||error).slice(0,400);
    }finally{
      try{await env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(tenantId).run()}catch(error){result.cleanupTenantError=String(error?.message||error).slice(0,160)}
      try{await env.DB.prepare('DELETE FROM users WHERE id=?').bind(userId).run()}catch(error){result.cleanupUserError=String(error?.message||error).slice(0,160)}
      try{
        const residual=await env.DB.prepare('SELECT count(*) count FROM users WHERE id=? OR email=?').bind(userId,email).first();
        result.residualUsers=Number(residual?.count||0);
      }catch(error){result.cleanupVerifyError=String(error?.message||error).slice(0,160)}
    }
    return Response.json(result,{status:result.ok&&result.residualUsers===0?200:500,headers:{'cache-control':'no-store'}});
  }
};
