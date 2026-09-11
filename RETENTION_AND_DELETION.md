# Retention & deletion v23

Implemented:
- legal-hold records
- deletion request records and status
- deletion requests blocked while a legal hold is active
- evidence retention metadata
- internal cleanup job for stale pending/failed evidence
- retention job secret
- user-visible deletion/legal-hold status

Important production step:
The cleanup route currently marks eligible evidence metadata for deletion. Wire the S3 DeleteObject call into the cleanup worker and confirm backup/retention policy before destructive deletion.
