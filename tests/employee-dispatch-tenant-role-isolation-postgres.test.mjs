import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

// All login grants/passwords below are created inside the disposable local
// PostgreSQL CI container. Never connect this to a non-CI server.
const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost","127.0.0.1"].includes(db.hostname) ||
    db.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

const tenantTables = [
  "employee_dispatch_proposal_versions",
  "employee_dispatch_proposal_heads",
  "employee_dispatch_proposal_reviews",
  "employee_dispatch_reviewer_permission_grants",
  "employee_dispatch_grant_issuance_audit",
  "employee_dispatch_review_session_provenance",
  "employee_dispatch_intents",
  "employee_dispatch_admission_audit",
  "employee_dispatch_grant_activation_audit"
];
const tenantRoleNames = ["employee_dispatch_ci_tenant_a","employee_dispatch_ci_tenant_b"];
const tenantClient = (role, password) => {
  const uri = new URL(process.env.DATABASE_URL);
  uri.username = role;
  uri.password = password;
  return new pg.Client({ connectionString: uri.toString() });
};

test("DB-authenticated roles isolate two tenants without trusting spoofable GUCs", async t => {
  const pool = new pg.Pool({ connectionString:process.env.DATABASE_URL,max:3 });
  const tenants = [randomUUID(),randomUUID()];
  const ids = [randomUUID(),randomUUID()];
  const reviewers = [randomUUID(),randomUUID()];
  const passwords = [randomUUID(),randomUUID()];
  const clients = [];
  try {
    for (let i=0;i<2;i++) {
      const tenantId=tenants[i];
      await pool.query("insert into tenants(id,name) values ($1,$2)",[
        tenantId,"CI isolated tenant "+i
      ]);
      await pool.query(
        "insert into users(id,email) values ($1,$2),($3,$4)",[
          reviewers[i],"isolation-reviewer-"+randomUUID()+"@example.invalid",
          ids[i],"isolation-owner-"+randomUUID()+"@example.invalid"
        ]);
      await pool.query(
        `insert into memberships(tenant_id,user_id,role,status)
         values ($1,$2,'reviewer','active'),($1,$3,'owner','active')`,
        [tenantId,reviewers[i],ids[i]]);
      await pool.query(
        `insert into employee_dispatch_proposal_versions
         (tenant_id,proposal_id,revision,author_id,action,payload_digest)
         values ($1,$2,1,$3,'internal.task.create',$4)`,
        [tenantId,"p-"+tenantId,ids[i],"a".repeat(64)]);
      await pool.query(
        `insert into employee_dispatch_proposal_heads
         (tenant_id,proposal_id,current_revision) values ($1,$2,1)`,
        [tenantId,"p-"+tenantId]);
      await pool.query(
        `insert into employee_dispatch_reviewer_permission_grants
         (tenant_id,reviewer_user_id,permission,granted_by_user_id,enabled)
         values ($1,$2,'people.workflow.approve',$3,false)`,
        [tenantId,reviewers[i],ids[i]]);
      await pool.query(
        "insert into employee_dispatch_ci_role_tenants(role_name,tenant_id) values ($1,$2)",
        [tenantRoleNames[i],tenantId]);
      // The CI schema creates NOLOGIN roles. Random LOGIN secrets are given
      // to those roles only in this isolated test and never committed.
      await pool.query(
        `alter role ${tenantRoleNames[i]} login password '${passwords[i]}'`
      );
      const client=tenantClient(tenantRoleNames[i],passwords[i]);
      await client.connect();
      clients.push(client);
    }

    await t.test("separate authenticated connections are non-superuser and no-bypass",async () => {
      for(let i=0;i<2;i++) {
        const principal=await clients[i].query("select current_user as name,session_user as login");
        assert.equal(principal.rows[0].name,tenantRoleNames[i]);
        assert.equal(principal.rows[0].login,tenantRoleNames[i]);
        const properties=await clients[i].query(
          "select rolsuper,rolbypassrls,rolinherit from pg_roles where rolname=current_user"
        );
        assert.deepEqual(properties.rows,[{
          rolsuper:false,rolbypassrls:false,rolinherit:false
        }]);
        await assert.rejects(
          clients[i].query(`set role ${tenantRoleNames[1-i]}`),
          e=>e.code==="42501"
        );
      }
    });

    await t.test("each role can only read its own row-bound tenant mapping",async () => {
      for(let i=0;i<2;i++) {
        const rows=await clients[i].query(
          "select tenant_id::text as id from employee_dispatch_ci_role_tenants"
        );
        assert.deepEqual(rows.rows,[{id:tenants[i]}]);
        await assert.rejects(
          clients[i].query(
            "update employee_dispatch_ci_role_tenants set tenant_id=$1 where role_name=$2",
            [tenants[1-i],tenantRoleNames[i]]
          ),
          e=>e.code==="42501"
        );
        await assert.rejects(
          clients[i].query(
            "insert into employee_dispatch_ci_role_tenants(role_name,tenant_id) values ($1,$2)",
            [tenantRoleNames[1-i],tenants[1-i]]
          ),
          e=>e.code==="42501"
        );
      }
    });

    await t.test("nine table policies expose only owned tenant and deny direct writes",async () => {
      for(let i=0;i<2;i++) {
        const client=clients[i];
        for(const name of tenantTables) {
          const table="public."+name; // Strict fixed allowlist above.
          const rows=await client.query("select tenant_id::text as id from "+table);
          for (const row of rows.rows) {
            assert.equal(row.id,tenants[i],name);
          }
          const grant=await client.query(
            "select has_table_privilege($1,'SELECT') as readable,has_table_privilege($1,'UPDATE') as writable",
            [table]
          );
          assert.deepEqual(grant.rows,[{readable:true,writable:false}]);
          await assert.rejects(
            client.query("delete from "+table), e=>e.code==="42501"
          );
        }
        const proposal=await client.query(
          "select proposal_id from employee_dispatch_proposal_versions"
        );
        assert.deepEqual(proposal.rows,[{proposal_id:"p-"+tenants[i]}]);
        const perms=await client.query(
          "select reviewer_user_id::text as id from employee_dispatch_reviewer_permission_grants"
        );
        assert.deepEqual(perms.rows,[{id:reviewers[i]}]);
      }
    });

    await t.test("writable app.tenant_id does not change authenticated role isolation",async () => {
      for(let i=0;i<2;i++) {
        const client=clients[i];
        await client.query("select set_config('app.tenant_id',$1,false)",[tenants[1-i]]);
        await client.query("select set_config('app.actor_id',$1,false)",[ids[1-i]]);
        const rows=await client.query(
          "select tenant_id from employee_dispatch_proposal_heads"
        );
        assert.deepEqual(rows.rows,[{tenant_id:tenants[i]}]);
        await client.query("BEGIN");
        try {
          await client.query("select set_config('app.tenant_id',$1,true)",[tenants[1-i]]);
          const rows2=await client.query(
            "select tenant_id from employee_dispatch_proposal_versions"
          );
          assert.deepEqual(rows2.rows,[{tenant_id:tenants[i]}]);
        } finally {
          await client.query("ROLLBACK");
        }
      }
    });

    await t.test("canonical sessions, memberships and users remain inaccessible",async () => {
      for (const client of clients) {
        for (const table of ["sessions","users","memberships","app_state"]) {
          await assert.rejects(
            client.query("select count(*) from public."+table),
            e=>e.code==="42501"
          );
        }
      }
    });

    await t.test("preview role remains unable to see any tenant bindings or data",async () => {
      const client=await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
        // A SQL permission error aborts its transaction unless isolated
        // behind a savepoint; re-establish the transaction before SELECT.
        await client.query("SAVEPOINT expect_denial");
        await assert.rejects(
          client.query("select * from employee_dispatch_ci_role_tenants"),
          e=>e.code==="42501"
        );
        await client.query("ROLLBACK TO SAVEPOINT expect_denial");
        const rows=await client.query("select * from employee_dispatch_proposal_versions");
        assert.deepEqual(rows.rows,[]);
      } finally {
        await client.query("ROLLBACK").catch(()=>{});
        client.release();
      }
    });
  } finally {
    for(const client of clients) await client.end().catch(()=>{});
    await pool.end();
  }
});
