import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

const role = "employee_dispatch_preview_reader";
const draftTables = [
  "employee_dispatch_proposal_versions",
  "employee_dispatch_proposal_heads",
  "employee_dispatch_proposal_reviews",
  "employee_dispatch_reviewer_permission_grants",
  "employee_dispatch_grant_issuance_audit",
  "employee_dispatch_grant_activation_audit",
  "employee_dispatch_review_session_provenance",
  "employee_dispatch_intents",
  "employee_dispatch_admission_audit"
];

test("PostgreSQL design-only dispatch reader is default-deny even with SELECT rights", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const tenant1 = randomUUID(), tenant2 = randomUUID();
  const proposal = "proposal-" + randomUUID();
  try {
    // Populate two actual tenant records under the trusted disposable CI owner.
    await pool.query(
      `insert into employee_dispatch_proposal_versions
       (tenant_id,proposal_id,revision,author_id,action,payload_digest)
       values ($1,$3,1,'author-1','internal.task.create',$4),
              ($2,$3,1,'author-2','internal.task.create',$5)`,
      [tenant1, tenant2, proposal, "a".repeat(64), "b".repeat(64)]
    );
    await pool.query(
      `insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision)
       values ($1,$3,1),($2,$3,1)`, [tenant1, tenant2, proposal]
    );
    const owner = await pool.query(
      `select count(*)::int as n from employee_dispatch_proposal_versions
       where proposal_id=$1 and tenant_id in ($2,$3)`,
      [proposal, tenant1, tenant2]
    );
    assert.equal(owner.rows[0].n, 2, "fixture contains data before testing RLS");

    await t.test("preview role has no login, privilege escalation or RLS bypass", async () => {
      const result = await pool.query(
        "select rolcanlogin,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname=$1",
        [role]
      );
      assert.equal(result.rowCount, 1);
      assert.deepEqual(result.rows[0], {
        rolcanlogin: false, rolsuper: false,
        rolbypassrls: false, rolinherit: false
      });
    });

    await t.test("all dispatch draft tables have RLS enabled and no permissive policies", async () => {
      const metadata = await pool.query(
        `select c.relname,c.relrowsecurity,
                (select count(*)::int from pg_policies p
                  where p.schemaname='public' and p.tablename=c.relname) as policies
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname=any($1::text[])
           and c.relkind in ('r','p')`,
        [draftTables]
      );
      assert.equal(metadata.rowCount, draftTables.length);
      for (const row of metadata.rows) {
        assert.equal(row.relrowsecurity, true, row.relname);
        assert.equal(row.policies, 0, row.relname);
      }
    });

    await t.test("SELECT is granted but RLS hides even matching tenant records", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
        await client.query("select set_config('app.tenant_id',$1,true)", [tenant1]);
        for (const name of draftTables) {
          // The names originate from an immutable allowlist above.
          const access = await client.query("select has_table_privilege($1,'SELECT') as allowed",
            ["public." + name]);
          assert.equal(access.rows[0].allowed, true, name);
          const rows = await client.query("select count(*)::int as n from public." + name);
          assert.equal(rows.rows[0].n, 0, name);
        }
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    });

    await t.test("preview role cannot insert or rewrite proposal, grant, intent or audit", async () => {
      const checks = [
        "insert into employee_dispatch_proposal_versions (tenant_id,proposal_id,revision,author_id,action,payload_digest) values ('x','x',1,'x','internal.task.create','" + "a".repeat(64) + "')",
        "update employee_dispatch_proposal_heads set revoked=true",
        "insert into employee_dispatch_reviewer_permission_grants (tenant_id,reviewer_user_id,permission,granted_by_user_id) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','people.workflow.approve','00000000-0000-0000-0000-000000000003')",
        "insert into employee_dispatch_intents (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key) values ('00000000-0000-0000-0000-000000000001','x','x','x','internal.task.create','task','x')",
        "delete from employee_dispatch_admission_audit",
        "delete from employee_dispatch_grant_issuance_audit",
        "delete from employee_dispatch_grant_activation_audit",
        "update employee_dispatch_review_session_provenance set recorded_at=now()"
      ];
      for (const statement of checks) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
          await assert.rejects(client.query(statement),
            err => err.code === "42501", statement);
        } finally {
          await client.query("ROLLBACK").catch(() => {});
          client.release();
        }
      }
    });

    await t.test("preview reader has no access to canonical identity/session tables", async () => {
      for (const table of ["memberships", "sessions", "users", "app_state"]) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
          await assert.rejects(
            client.query("select count(*) from public." + table),
            err => err.code === "42501", table
          );
        } finally {
          await client.query("ROLLBACK").catch(() => {});
          client.release();
        }
      }
    });
  } finally {
    // No cleanup DML: the PostgreSQL service exists for CI only.
    await pool.end();
  }
});
