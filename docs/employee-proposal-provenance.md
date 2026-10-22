# Employee proposal provenance

New manually generated onboarding reviews use a versioned identity containing
tenant, workflow owner, exact stored workflow hash, employee, routine, deadline
and proposal payload hash. The owner comes from the authenticated generation
scope and stored workflow row, never request-body author fields.

Review creation and immutable provenance insertion share one D1 batch. SQL
rechecks workflow ownership, exact definition, active membership and the active
employee's onboarding date before creating the review. A storage failure rolls
back both records. Repeated identical generation returns the existing key;
another owner, workflow definition or payload produces a separate review.

`loadApprovedProvenance` is a read snapshot, not an execution grant. It requires
an approved matching immutable event, an independent active reviewer, active
workflow owner, current workflow bytes and unchanged active employee deadline.
It recomputes the hashes and versioned key. The future executor must recheck
these facts atomically with the canonical Runtime Guard, internal effect and
lease-fenced completion. No executor or automatic dispatch is connected here.

Legacy review rows remain readable and retain their audit history. They receive
no guessed author, backfilled provenance or new execution eligibility. Existing
pending reviews may coexist with newly generated versioned reviews. Contract
end dates remain excluded as renewal deadlines; only onboarding currently has
the required authoritative date binding for approved provenance loading.

## Rollout and recovery

Before deploying the new generation code, apply the pinned
`20261022_employee_ai_proposal_provenance.sql` through the existing reviewed
production employee migration process. Its exact blob is pinned alongside the
two prior schemas; current-main authority, schema-drift refusal, pre-write Time
Travel bookmark and post-write verification remain in place. No live migration
is performed by this source change or its PR tests.

If the table is missing, generation fails without leaving a new review behind.
Roll back application code independently if needed; retain provenance and review
history. Any database restore uses the captured bookmark under a separately
authorized recovery procedure. Do not rewrite or delete immutable bindings to
make an older approval match a changed workflow.
