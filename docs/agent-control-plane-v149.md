# Thebe Agent Control Plane V149

This increment establishes canonical machine identities before any further autonomous authority is added.

## Invariants

- `thebe` is the only canonical Super Agent identity: `THEBE-001`.
- Finance Watch uses a distinct non-human observer identity: `SYS-FIN-OBS-001`.
- Registry membership never grants execution authority.
- New identities default to `restricted` and `execution_capable=0`.
- The registry cannot escalate `execution_capable` from 0 to 1.
- A `revoked` identity cannot be reactivated in place.
- Authority changes require append-only evidence in `agent_authority_events`.
- Drift findings are durable evidence and are not execution grants.

## Authority states

- **active**: identity is healthy; actual tool authority is still determined by Runtime Guard and grants.
- **restricted**: safe/read-only operation only.
- **suspended**: consequential execution must fail closed.
- **revoked**: terminal identity state; replacement requires a new identity.

## Rollout boundary

V149 is intentionally control-plane-only. It does not alter the production release manifest, enable bounded execution, create payment/filing/signature/HR/journal authority, or permit external side effects.

Next increment: wire Runtime Guard and scheduled/voice entry points to the canonical authority state, then add drift evaluation. JIT single-use grants come only after containment is proven.
