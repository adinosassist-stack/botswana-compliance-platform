# Agent runtime containment

V316 adds a fail-closed tenant containment check to the existing bounded JIT task execution lane. It does not create execution authority, replace owner approval, bypass the Runtime Guard, or activate agent cost accounting.

## Controls

The JIT capability boundary reads the existing platform controls plus two tenant-scoped stop lists:

- `AGENT_RUNTIME_ENABLED=0` disables the runtime globally.
- `AGENT_RUNTIME_KILL_SWITCH=1` stops the runtime globally.
- `AGENT_RUNTIME_SUSPENDED_TENANTS` is a comma-separated list of tenant IDs whose JIT permit issuance and execution are stopped.
- `AGENT_RUNTIME_QUARANTINED_TENANTS` is a comma-separated list of tenant IDs whose JIT permit issuance and execution are stopped for investigation.
- The canonical `THEBE-001` authority must also remain ready, active and execution-capable in the existing agent control plane.

Example only:

```text
AGENT_RUNTIME_SUSPENDED_TENANTS=tenant-a,tenant-b
AGENT_RUNTIME_QUARANTINED_TENANTS=tenant-c
```

Empty tenant lists mean no tenant-specific containment. Malformed lists fail closed rather than silently ignoring an operator error. Tenant IDs are never inferred from request payloads; the authenticated tenant scope is used.

## Execution boundary

Containment is re-evaluated after owner authentication and before both:

1. issuing a signed single-use JIT capability, and
2. accepting a signed JIT capability for execution.

That second check means a tenant quarantined or suspended after capability issuance is still denied before the mature executor is reached. The executor continues to enforce canonical-agent authority, global kill switch, budget status, owner approval, payload binding, active delegation/grant, JIT single-use consumption and the Runtime Guard.

## Safety boundary

V316 does not add a production migration or database write path. It does not auto-quarantine tenants, cancel or mutate historical records, grant capabilities, send messages, transfer money, or enable autonomous external side effects. Automatic anomaly detection may become a future input to quarantine, but it is not part of this change.

Agent cost accounting remains **experimental / disabled**. The V316 containment controls neither enable the experimental cost schema nor treat cost admission as execution authority.
