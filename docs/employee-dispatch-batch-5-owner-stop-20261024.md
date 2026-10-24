# Batch #5 — authenticated owner stop, development only

Adds one internal stop-only service around Batch #4's durable controls. It is
default-off, requires both server-owned draft flags to be strict true, and is
not imported by server startup or any Node/Worker route. It cannot enable or
resume execution. No production migration, deployment or activation is included.

The trusted server session resolver selects the workspace/session; request
tenant, actor and role claims provide no authority. Inside the transaction the
service locks controls, revalidates active owner membership, current session
generation, revocation and live expiry, and compares the expected revision.
Concurrent callers cannot overwrite a newer control revision.

A successful change disables the feature, activates kill switch and stop, and
records the owner/session against the exact immutable state-change audit row.
Any failed provenance audit rolls back the control change and state audit.
Repeating a stop at its current revision is a no-op, with no duplicate audit.

The database trigger validates audit binding and canonical owner/session
relationships. It does **not** prove the identity of a privileged SQL caller.
The resolver must eventually be connected to existing auth/origin/CSRF
middleware; this draft registers no such API. Production principal binding,
least-privilege writers, retention/deletion behavior for session audit FKs,
atomic task/report effects, polling and separately approved activation remain
release blockers. Ordinary raw control changes in CI retain the Batch #4
state audit and are not claimed as authenticated owner actions.
