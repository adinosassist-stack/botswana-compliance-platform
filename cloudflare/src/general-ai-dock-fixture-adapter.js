/** Review-only Dock fixture lifecycle. Not mounted by a Worker or workflow.
 * Caller must independently verify exact isolated D1 identity and protected approval.
 * Never pass production or an existing module's database to this adapter.
 */
const ID=/^dock-fixture-[a-f0-9]{32}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const deny=(ok,reason)=>{if(!ok)throw Error(reason)};
export function createDockFixtureAdapter({db, databaseId, qualifiedDatabaseId, fixtureId, tokenHash, csrfToken}={}) {
  deny(UUID.test(databaseId||'') && databaseId===qualifiedDatabaseId &&
    databaseId!=='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce' &&
    databaseId!=='ff229eef-7724-49ae-9d68-d3a1db669b63','dedicated_database_required');
  deny(ID.test(fixtureId||''),'synthetic_fixture_required');
  deny(HEX.test(tokenHash||'')&&HEX.test(csrfToken||'')&&tokenHash!==csrfToken,'invalid_fixture_credentials');
  deny(typeof db?.prepare==='function'&&typeof db?.batch==='function','database_binding_required');
  const tenant=fixtureId+'-tenant',user=fixtureId+'-user',email=fixtureId+'@dock.invalid',publicId=fixtureId+'-session';
  const stmt=(sql,...params)=>db.prepare(sql).bind(...params);
  async function verify(){
    const marker=await stmt("SELECT database_id,environment FROM dock_staging_identity WHERE id=1").first();
    deny(marker?.database_id===databaseId && marker.environment==='dock-hosted-staging','database_identity_unqualified');
  }
  async function batch(statements){
    const results=await db.batch(statements);
    deny(Array.isArray(results)&&results.length===statements.length&&results.every(r=>r?.success===true),'fixture_batch_unconfirmed');
  }
  return Object.freeze({
    userId:user,tenantId:tenant,
    async create(){
      await verify();
      await batch([
        stmt("INSERT INTO tenants(id,name) VALUES(?,?)",tenant,"Synthetic Dock workspace"),
        stmt("INSERT INTO users(id,email,display_name) VALUES(?,?,?)",user,email,"Synthetic Dock tester"),
        stmt("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)",tenant,user,"owner","active"),
        stmt("INSERT INTO sessions(token_hash,public_id,user_id,tenant_id,role,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?,0,datetime('now','+10 minutes'))",tokenHash,publicId,user,tenant,"owner",csrfToken),
        stmt("INSERT INTO app_state(tenant_id,version,state_json) VALUES(?,1,?)",tenant,'{}')
      ]);
    },
    async remove(){
      await verify();
      await batch([
        stmt("DELETE FROM app_state WHERE tenant_id=?",tenant),
        stmt("DELETE FROM sessions WHERE user_id=? AND tenant_id=?",user,tenant),
        stmt("DELETE FROM memberships WHERE user_id=? AND tenant_id=?",user,tenant),
        stmt("DELETE FROM users WHERE id=? AND email=?",user,email),
        stmt("DELETE FROM tenants WHERE id=?",tenant)
      ]);
    },
    async assertAbsent(){
      await verify();
      for(const [sql,args] of [
        ["SELECT count(*) AS n FROM app_state WHERE tenant_id=?",[tenant]],
        ["SELECT count(*) AS n FROM sessions WHERE user_id=? OR tenant_id=? OR token_hash=?",[user,tenant,tokenHash]],
        ["SELECT count(*) AS n FROM memberships WHERE user_id=? OR tenant_id=?",[user,tenant]],
        ["SELECT count(*) AS n FROM users WHERE id=? OR email=?",[user,email]],
        ["SELECT count(*) AS n FROM tenants WHERE id=?",[tenant]]
      ]) {
        const row=await stmt(sql,...args).first();
        deny(row?.n===0,'fixture_cleanup_unconfirmed');
      }
    }
  });
}
