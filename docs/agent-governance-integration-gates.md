# Agent governance integration gates

1. The new Node.js policy and PostgreSQL adapter are **not** wired into the Cloudflare Worker Owner Operator API. Worker runtime cannot import Node crypto or pg directly.
2. Keep all agentic mutation flags OFF until a runtime-compatible policy is implemented and reviewed. Existing Worker agent-policy.js remains the authority for Worker routes.
3. A consumed approval only authorizes a *future* operation; it does not guarantee the protected operation executed. For money movement, introduce a durable outbox with idempotent execution and reconciliation before enabling actions.
4. Approval creation must authenticate the approver independently and verify tenant, role, strong authentication, exact arguments, expiry and unique nonce. No model may create its own approved approval.
5. Implement per-tenant quotas and verified immutable audit retention; do not expose raw evidence to another tenant.
6. Test migration on a disposable database before production rollout.
7. Run the Agent Governance Unit Tests workflow and the repository's full regression suite.
8. Validate production rollback, emergency disable and alerting.
9. Keep feature flag disabled until security and product owners explicitly approve.
10. Roll out to Botswana pilot tenants before Namibia expansion.

The unit tests use a mocked PostgreSQL client for adapter behavior. The separate PostgreSQL integration workflow applies the real migrations and verifies uniqueness, tenant scope, audit/outbox rollback, and approval-consumption rollback under an injected audit INSERT failure. Draft queueing and sensitive authorization are separate test cases: sensitive actions cannot be queued or executed. These tests do not establish Cloudflare integration, executor behavior, or production activation readiness.
