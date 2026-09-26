# Thebe Agent Control Plane V154

V154 introduces a canonical machine-identity control plane for the single Thebe Super Agent without creating new business-action authority.

## Canonical identities

- `THEBE-001 / thebe`: the single canonical Super Agent identity.
- `SYS-FIN-OBS-001 / system_observer`: a separate read-only system observer identity used for governed Finance Watch work.

Thebe is seeded `active` and `execution_capable=1` so this migration does not silently disable the already-governed internal `task.create` capability. Those registry fields are only an additional containment prerequisite. They do not create a delegation, execution grant, approval, tenant permission, budget, or Runtime Guard pass.

## Containment invariants

- Missing or unavailable canonical identity fails consequential execution closed.
- `restricted`, `suspended`, or `revoked` Thebe cannot execute.
- The registry cannot raise `execution_capable` from 0 to 1 after creation.
- `revoked` is terminal for that identity.
- Canonical identity metadata is immutable.
- Global authority-state transitions are platform-admin only, origin/CSRF protected, and append durable authority evidence.
- Drift checks compare canonical structural identity to the expected contract and can persist open/resolved findings.

## Existing execution gates remain mandatory

The control plane is not an authorization shortcut. `task.create` still requires the existing release flag/canary, tenant-scoped delegation, active execution grant, explicit owner approval, payload-hash binding, Runtime Guard, kill switch, budget checks, daily limits, atomic D1 write, receipt, and verification.

Voice and WhatsApp remain prepare/read surfaces. They receive no approval or execution authority from the registry.
