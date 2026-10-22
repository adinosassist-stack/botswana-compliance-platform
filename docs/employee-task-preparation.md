# Employee proposal task preparation

This preparation-only bridge depends on immutable employee proposal provenance.
It is disabled unless `THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED` is exactly the
string `true`. This change sets no deployment configuration and activates nothing.

The existing authenticated, tenant-scoped `POST /api/employee-workflow-reviews`
endpoint accepts:

```json
{"action":"prepare_task","proposalKey":"<approved versioned proposal key>","delegationId":"<active task.create delegation>"}
```

Only those three fields are accepted. Tenant and requester come from the verified
session; title, severity and due date come from the stored, hash-verified proposal.
The endpoint remains behind the Worker's existing session and CSRF validation.
Owner and manager sessions can prepare; the existing task flow requires separate
exact owner approval before execution. Employee review approval never supplies
owner task approval, a standing authorization, a JIT permit or an execution grant.

Preparation uses the existing bounded task preparation routine. It requires an
active `task.create` delegation and its separate execution grant. The task title
and workflow description use the approved snapshot. High severity maps to priority
1 and normal severity to priority 2. A date-only deadline maps to midnight UTC.
The employee proposal key is not an `agentic_proposals` foreign key.

The intent insert rechecks the current independent reviewer, author membership,
requester membership, review event, workflow definition, active employee and
onboarding date in the same D1 transaction as task request creation and audit.
It also rechecks the selected delegation and grant. A changed source returns 409
with no preparation writes. Any write or audit failure rolls back the batch.

A SHA-256 digest of the tenant-bound versioned proposal key supplies a stable
idempotency key. Concurrent calls and retries return the same task request.
A replay requires its original employee provenance audit linkage and the same
selected delegation and grant; unrelated task preparations cannot be adopted.
The task preparation audit records the proposal key, author, workflow and proposal
revisions, reviewer, review time, task payload hash, delegation and grant.

A prepared task is a snapshot for a fresh owner decision. Later employee source
changes block new preparations and replays; they do not automatically cancel an
already prepared task. This is not an autonomous dispatch executor, and must not
be used as one. Any future automatic execution requires source revalidation
atomically with effect creation and dispatch completion. The existing manual
owner approval, canonical agent authority, runtime guard, execution mode, kill
switch and single-use JIT controls continue to govern manual task execution.

There is no new migration. Roll out the provenance migration before its producer
code, then this bridge; its flag should remain off until reviewed activation.
Disable preparation by removing the flag. Existing prepared tasks and audit
history remain subject to the normal owner review/cancellation flow.

Verification includes real SQLite API tests and actual local workerd D1 tests
for concurrent retries, stale-source races, rollback and absence of execution.
No live tenant data or production execution is involved in those tests.

## People workspace controls

The pending-review response advertises `taskPreparationEnabled` only from the
server flag. When it is true, the People review panel offers **Approved proposals**.
Opening this view requests `GET /api/employee-workflow-reviews?view=approved`.
It lists only hash-verified, currently eligible provenance, with 25 rows per page.
The tenant comes from the verified session. An opaque `after` cursor orders by
proposal key; Previous, Next and Refresh preserve page navigation. Listing is a
read snapshot, never preparation or execution authority.

Only when approved proposals are opened and present does the panel read the
existing bounded-task status endpoint to discover an active delegation. It adds
no requests to initial People mounting. Without one unambiguous active grant,
it explains that owner authorization is needed and offers no preparation button.
This view neither creates nor changes a grant.

**Prepare task for owner review** sends only action, proposal key and delegation
ID. All controls serialize requests. The panel describes prepared, approved,
previously executed and cancelled responses separately, and leaves conflicts
retryable after refreshing. It never invokes approval, permit or execution APIs.
Closing the panel ignores late responses. With an older backend or the flag off,
the new controls stay hidden and the existing pending-review flow remains usable.
