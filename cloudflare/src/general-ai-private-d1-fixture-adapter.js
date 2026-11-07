/** Review-only isolated General AI staging fixture adapter.
 * UNMOUNTED: no Worker, route, scheduled job, credential or deploy path imports this.
 * Caller must independently prove the D1 binding identity and obtain protected approval.
 */
const ID=/^ga-test-[a-f0-9]{32}$/;
const HASH=/^[a-f0-9]{64}$/;
const assert=(ok,reason)=>{if(!ok)throw Error(reason)};

export function createPrivateGeneralAiFixtureAdapter({db, fixtureId, tokenHash, csrfToken, expiresAt}) {
  assert(ID.test(fixtureId||''),'fixture_synthetic_id_required');
  assert(HASH.test(tokenHash||''),'fixture_token_hash_required');
  assert(typeof csrfToken==='string' && csrfToken.length>=24 && csrfToken.length<=128,'fixture_csrf_required');
  assert(typeof expiresAt==='string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(expiresAt),'fixture_expiry_required');
  assert(db && typeof db.prepare==='function','fixture_db_binding_required');
  const tenant=fixtureId+'-tenant';
  const email=fixtureId+'@example.invalid';
  const queries={
    user:['INSERT INTO users (id,email,session_generation) VALUES (?,?,0)',[fixtureId,email]],
    membership:['INSERT INTO memberships (user_id,tenant_id,role,status) VALUES (?,?,?,?)',[fixtureId,tenant,'owner','active']],
    session:['INSERT INTO sessions (token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,0,?)',[tokenHash,fixtureId,tenant,csrfToken,expiresAt]]
  };
  const deletes={
    session:['DELETE FROM sessions WHERE token_hash=? AND user_id=? AND tenant_id=?',[tokenHash,fixtureId,tenant]],
    membership:['DELETE FROM memberships WHERE user_id=? AND tenant_id=?',[fixtureId,tenant]],
    user:['DELETE FROM users WHERE id=? AND email=?',[fixtureId,email]]
  };
  async function run(sql,params){const stmt=db.prepare(sql);assert(typeof stmt?.bind==='function','fixture_parameter_binding_required');const bound=stmt.bind(...params);assert(typeof bound?.run==='function','fixture_run_required');return bound.run()}
  async function count(sql,params){const stmt=db.prepare(sql);assert(typeof stmt?.bind==='function','fixture_parameter_binding_required');const bound=stmt.bind(...params);assert(typeof bound?.first==='function','fixture_read_required');const row=await bound.first();assert(Number.isSafeInteger(row?.n)&&row.n>=0,'fixture_count_invalid');return row.n}
  return Object.freeze({
    async create(kind,id){assert(id===fixtureId,'fixture_identity_mismatch');assert(Object.hasOwn(queries,kind),'fixture_kind_invalid');const [sql,p]=queries[kind];await run(sql,p)},
    async remove(kind,id){assert(id===fixtureId,'fixture_identity_mismatch');assert(Object.hasOwn(deletes,kind),'fixture_kind_invalid');const [sql,p]=deletes[kind];await run(sql,p)},
    async assertAbsent(id){assert(id===fixtureId,'fixture_identity_mismatch');const checks=[
      ['SELECT count(*) AS n FROM users WHERE id=?',[fixtureId]],
      ['SELECT count(*) AS n FROM memberships WHERE user_id=? AND tenant_id=?',[fixtureId,tenant]],
      ['SELECT count(*) AS n FROM sessions WHERE token_hash=? OR (user_id=? AND tenant_id=?)',[tokenHash,fixtureId,tenant]]
    ];for(const [sql,p] of checks)assert(await count(sql,p)===0,'fixture_residual_records')}
  });
}
