from pathlib import Path

worker_path = Path('cloudflare/src/worker.js')
worker = worker_path.read_text()

old_partner = '''async function consumePartnerPoolIfAvailable(env,tenantId,feature,referenceId=null){
  const alloc=await env.DB.prepare(
    `SELECT pca.partner_tenant_id,pca.monthly_cap,pca.used_this_month,pcp.balance
     FROM partner_credit_allocations pca
     JOIN partner_credit_pools pcp ON pcp.partner_tenant_id=pca.partner_tenant_id
     WHERE pca.client_tenant_id=? AND pca.month_key=? LIMIT 1`
  ).bind(tenantId,monthKey()).first();
  const cost=AI_CREDIT_COSTS[feature]||0;
  if(!alloc || cost<=0) return null;
  if(Number(alloc.used_this_month)+cost>Number(alloc.monthly_cap)) return null;
  if(Number(alloc.balance)<cost) return null;
  await env.DB.batch([
    env.DB.prepare("UPDATE partner_credit_pools SET balance=balance-?,updated_at=CURRENT_TIMESTAMP WHERE partner_tenant_id=? AND balance>=?").bind(cost,alloc.partner_tenant_id,cost),
    env.DB.prepare("UPDATE partner_credit_allocations SET used_this_month=used_this_month+? WHERE partner_tenant_id=? AND client_tenant_id=?").bind(cost,alloc.partner_tenant_id,tenantId),
    env.DB.prepare("INSERT INTO ai_credit_ledger(tenant_id,entry_type,credits,feature,reference_id,metadata_json) VALUES(?,'usage',?,?,?,?)").bind(
      tenantId,-cost,feature,referenceId,JSON.stringify({funding:"partner_pool",partnerTenantId:alloc.partner_tenant_id})
    )
  ]);
  return {ok:true,cost,funding:"partner_pool",partnerTenantId:alloc.partner_tenant_id};
}'''

new_partner = '''async function consumePartnerPoolIfAvailable(env,tenantId,feature,referenceId=null){
  const month=monthKey(),cost=AI_CREDIT_COSTS[feature]||0;
  if(cost<=0)return null;
  const alloc=await env.DB.prepare(
    `SELECT pca.partner_tenant_id
     FROM partner_credit_allocations pca
     JOIN partner_credit_pools pcp ON pcp.partner_tenant_id=pca.partner_tenant_id
     WHERE pca.client_tenant_id=? AND pca.month_key=? LIMIT 1`
  ).bind(tenantId,month).first();
  const partnerTenantId=String(alloc?.partner_tenant_id||"");
  if(!partnerTenantId)return null;

  // Claim the client's monthly allocation atomically. A read-then-update check is
  // unsafe here because concurrent AI requests can both observe the same remaining cap.
  const allocationClaim=await env.DB.prepare(`UPDATE partner_credit_allocations
    SET used_this_month=used_this_month+?
    WHERE partner_tenant_id=? AND client_tenant_id=? AND month_key=?
      AND used_this_month+?<=monthly_cap
    RETURNING used_this_month,monthly_cap`).bind(cost,partnerTenantId,tenantId,month,cost).first();
  if(!allocationClaim)return null;

  let poolClaim=null;
  try{
    poolClaim=await env.DB.prepare(`UPDATE partner_credit_pools
      SET balance=balance-?,updated_at=CURRENT_TIMESTAMP
      WHERE partner_tenant_id=? AND balance>=?
      RETURNING balance`).bind(cost,partnerTenantId,cost).first();
  }catch(error){
    await env.DB.prepare(`UPDATE partner_credit_allocations SET used_this_month=MAX(0,used_this_month-?)
      WHERE partner_tenant_id=? AND client_tenant_id=? AND month_key=?`).bind(cost,partnerTenantId,tenantId,month).run().catch(()=>{});
    throw error;
  }
  if(!poolClaim){
    await env.DB.prepare(`UPDATE partner_credit_allocations SET used_this_month=MAX(0,used_this_month-?)
      WHERE partner_tenant_id=? AND client_tenant_id=? AND month_key=?`).bind(cost,partnerTenantId,tenantId,month).run();
    return null;
  }

  try{
    await env.DB.prepare("INSERT INTO ai_credit_ledger(tenant_id,entry_type,credits,feature,reference_id,metadata_json) VALUES(?,'usage',?,?,?,?)").bind(
      tenantId,-cost,feature,referenceId,JSON.stringify({funding:"partner_pool",partnerTenantId})
    ).run();
  }catch(error){
    await env.DB.batch([
      env.DB.prepare("UPDATE partner_credit_pools SET balance=balance+?,updated_at=CURRENT_TIMESTAMP WHERE partner_tenant_id=?").bind(cost,partnerTenantId),
      env.DB.prepare(`UPDATE partner_credit_allocations SET used_this_month=MAX(0,used_this_month-?)
        WHERE partner_tenant_id=? AND client_tenant_id=? AND month_key=?`).bind(cost,partnerTenantId,tenantId,month)
    ]).catch(()=>{});
    throw error;
  }
  return {ok:true,cost,funding:"partner_pool",partnerTenantId,balance:Number(poolClaim.balance),monthlyUsed:Number(allocationClaim.used_this_month)};
}'''

if worker.count(old_partner) != 1:
    raise SystemExit(f'partner pool function marker count={worker.count(old_partner)}')
worker = worker.replace(old_partner, new_partner, 1)

old_wallet = '''async function aiWallet(env,tenantId){
  let r=await env.DB.prepare("SELECT balance,monthly_allowance,monthly_reset_at,lifetime_purchased,lifetime_used FROM ai_credit_wallets WHERE tenant_id=?").bind(tenantId).first();
  if(!r){
    await env.DB.prepare("INSERT INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,0)").bind(tenantId).run();
    r={balance:0,monthly_allowance:0,monthly_reset_at:null,lifetime_purchased:0,lifetime_used:0};
  }
  return r;
}'''
new_wallet = '''async function aiWallet(env,tenantId){
  let r=await env.DB.prepare("SELECT balance,monthly_allowance,monthly_reset_at,lifetime_purchased,lifetime_used FROM ai_credit_wallets WHERE tenant_id=?").bind(tenantId).first();
  if(!r){
    await env.DB.prepare("INSERT OR IGNORE INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,0)").bind(tenantId).run();
    r=await env.DB.prepare("SELECT balance,monthly_allowance,monthly_reset_at,lifetime_purchased,lifetime_used FROM ai_credit_wallets WHERE tenant_id=?").bind(tenantId).first();
    if(!r)throw new Error("ai_wallet_unavailable");
  }
  return r;
}'''
if worker.count(old_wallet) != 1:
    raise SystemExit(f'ai wallet function marker count={worker.count(old_wallet)}')
worker = worker.replace(old_wallet, new_wallet, 1)
worker_path.write_text(worker)

# Strengthen the existing release-chain AI-margin test rather than adding an unreferenced test.
test_path = Path('tests/ai-margin-static.mjs')
test = test_path.read_text()
new_test = '''import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const allocationClaim=s.indexOf("used_this_month+?<=monthly_cap");
const poolClaim=s.indexOf("balance>=?\\n      RETURNING balance");
const partnerLedger=s.indexOf('funding:"partner_pool"');
const allocationRollback=(s.match(/used_this_month=MAX\\(0,used_this_month-\\?\\)/g)||[]).length;
const checks=[
 ["cost controls",schema.includes("ai_cost_controls")],
 ["provider costs",schema.includes("ai_provider_costs")],
 ["spend guard",s.includes("checkAiSpendGuard")],
 ["partner fallback",s.includes("consumePartnerPoolIfAvailable")],
 ["partner allocation cap claimed atomically",allocationClaim>=0&&s.includes("RETURNING used_this_month,monthly_cap")],
 ["partner pool balance claimed atomically",poolClaim>=0],
 ["partner claims precede funded ledger entry",allocationClaim>=0&&poolClaim>allocationClaim&&partnerLedger>poolClaim],
 ["failed partner claims are compensated",allocationRollback>=2&&s.includes("balance=balance+?,updated_at=CURRENT_TIMESTAMP WHERE partner_tenant_id=?")],
 ["AI wallet first-use initialization is idempotent",s.includes("INSERT OR IGNORE INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,0)")],
 ["AI wallet is re-read after first-use insert",s.includes('if(!r)throw new Error("ai_wallet_unavailable")')],
 ["cost control endpoint",s.includes("/api/ai/cost-control")],
 ["provider cost endpoint",s.includes("/api/ai/provider-cost")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);'''
test_path.write_text(new_test)

# Remove the one-off patch machinery from the candidate itself.
Path('scripts/tmp-ai-credit-concurrency-patch.py').unlink(missing_ok=True)
Path('.github/workflows/tmp-ai-credit-concurrency-patch.yml').unlink(missing_ok=True)
