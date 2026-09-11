# Storage deletion v24

Implemented:
- actual S3-compatible DeleteObject execution
- legal-hold check immediately before destructive storage deletion
- deletion status, attempts and error fields
- retry ceiling
- storage deletion audit events
- approved/completed deletion state transitions
- completion blocked while any evidence object remains

Operational note:
Use a scheduled internal worker or trusted job runner to call the retention cleanup route. Keep RETENTION_JOB_SECRET in the deployment secret manager.
