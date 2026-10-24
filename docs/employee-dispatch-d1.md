# Default-off production D1 employee dispatcher

This is the production Cloudflare/D1 integration for bounded employee **internal
task creation**. It replaces neither human review nor the existing task execution
controls. PostgreSQL draft worker tables are not used by this runtime.

The scheduler and authenticated owner API are disabled unless
`THEBE_EMPLOYEE_DISPATCH_ENABLED` is exactly `true`. This patch changes no deployment
variables. Migration `20261024_employee_dispatch.sql` creates empty queue/control
tables; controls default to disabled/stopped, and a missing control denies work.
There is no enable/resume endpoint, automatic approval, permit renewal, external
side effect, or report-draft adapter.

## Real execution path

1. Generate an immutable, versioned employee onboarding proposal and obtain its
   independent current reviewer decision through the existing review API.
2. Use the existing preparation bridge to prepare its exact task snapshot.
3. Obtain separate exact owner task approval and a short-lived single-use JIT
   permit through the existing task API. The dispatcher issues neither.
4. The authenticated owner can enqueue that specific request, permit and proposal.
   The server binds the live owner session, tenant and prepared provenance audit.
5. The existing scheduled entry point claims up to ten due jobs per sweep and
   calls the existing bounded executor. A tenant-scoped owner tick is also wired.

`/api/agentic/employee-dispatch` accepts owner-only GET status and CSRF/origin-
checked POST bodies:

- `{"action":"enqueue","requestId":"…","permitId":"…","proposalKey":"…"}`
- `{"action":"tick"}`
- `{"action":"stop","expectedRevision":1}`

Unknown fields and actions are rejected. GET never returns session hashes, lease
or JIT tokens. The stop operation only disables/stops; its compare-and-swap,
current session/membership check, state audit and owner audit commit together.
Revision zero creates a missing stopped control, without enabling anything.

## Transaction and recovery contract

Claims are a single D1 UPDATE/RETURNING with a rotating random token, 45-second
lease and fixed three-attempt limit. Simultaneous workers cannot claim the same
unexpired lease. Transient failures back off ten then twenty seconds; an expired
third lease or final failure is dead-lettered. Stale workers cannot release or
complete a replacement lease. Non-transient authority denials are terminal.
There is no renewal of the owner's five-minute JIT authorization window.

The effect batch fences the queue, rechecks current approved employee provenance,
workflow/employee source, independent reviewer and author memberships, the live
owner session/generation/membership, active delegation and execution grant,
current daily allowance, canonical agent authority and exact owner approval. The
existing Runtime Guard, execution mode, kill switch and JIT checks remain intact.
The same D1 transaction creates the task and receipt, consumes the permit and
writes effect/transition audits and queue completion. Completion requires the
actual linked task, receipt and effect audit and a still-valid lease/control.
An audit failure or a late lease expiry rolls the entire effect transaction back.
A queued request cannot bypass the dispatch fence through manual execution.

D1's `meta.changes` includes trigger side effects. The executor now checks the
UPDATE's returned request row, rather than mistaking a task update plus JIT
trigger update for a conflict. Real D1 regression tests cover the manual execution
path with dispatch disabled as well as the queued path.

## Qualification and rollout

`npm run test:employee-dispatch` exercises SQLite race injection plus actual local
workerd D1 transactions, concurrent claims, rollback, operator-stop races,
short-lived owner/session authority and bounded retry recovery. Existing employee
provenance/preparation, owner execution, canonical authority and persistent-task
regressions remain in scope. These tests use isolated synthetic databases.

The pinned employee-workflow migration workflow includes this additive migration,
checks exact merged main authority, captures a pre-migration D1 Time Travel
bookmark and verifies schema definitions/foreign keys. Applying empty schema does
not activate execution. Deploy code with the flag absent; rollback by keeping or
removing the flag and stopping tenant controls. Do not remove completed audit or
effect history. Any later activation is a separate reviewed operational decision.
Regulatory source/rule activation remains independently held.
