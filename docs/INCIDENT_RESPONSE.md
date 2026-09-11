# Incident Response Runbook

## Severity
- SEV-1: confirmed unauthorized access, cross-tenant exposure, compromised credentials/secrets, material evidence leak.
- SEV-2: suspected exposure, malware upload, prolonged authentication or database failure.
- SEV-3: non-sensitive availability or functional defect.

## First actions
1. Record incident ID, UTC time, reporter and affected tenant(s).
2. For SEV-1/2, preserve logs and revoke exposed sessions/credentials.
3. Isolate affected integration, object bucket prefix or deployment if needed.
4. Do not delete evidence required for investigation.
5. Determine whether personal data is affected and activate applicable Botswana data-protection notification/legal review.

## Containment options
- revoke all sessions for a tenant/user
- rotate database/object-store/integration credentials
- disable evidence uploads
- block a legal rule version by changing status to `blocked`
- disable an integration adapter
- put app behind maintenance mode/load-balancer deny rule

## Recovery
- patch root cause
- run migrations/tests
- restore from known-good backup if required
- verify tenant isolation and affected objects
- re-enable service gradually
- document timeline, impact and corrective actions

## Post-incident
- professional privacy/legal review where appropriate
- customer/regulator communication as required
- update threat model and automated regression tests
