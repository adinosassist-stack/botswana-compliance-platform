# Platform regulatory provisioning

Global regulatory publishing is intentionally separate from tenant roles.

A platform regulatory user must satisfy both controls:
1. Their signed-in email is present in the appropriate Cloudflare environment allowlist.
2. Their immutable application `user_id` is explicitly provisioned in `platform_regulatory_principals`.

Example after the two staff accounts have been created:

```sql
INSERT INTO platform_regulatory_principals(user_id,email,role,active)
SELECT id,email,'editor',1 FROM users WHERE lower(email)=lower('editor@example.com');

INSERT INTO platform_regulatory_principals(user_id,email,role,active)
SELECT id,email,'reviewer',1 FROM users WHERE lower(email)=lower('reviewer@example.com');
```

Configure corresponding Cloudflare variables:
- `PLATFORM_REGULATORY_EDITORS`
- `PLATFORM_REGULATORY_REVIEWERS`
- `PLATFORM_ADMIN_EMAILS` only for separately controlled platform admins.

Use separate people/accounts for editor and reviewer. Maker-checker rules prevent an author from approving or publishing their own rule and prevent a source submitter from approving their own source.

Source snapshots are stored in the configured R2 `EVIDENCE` bucket under `platform/regulatory/sources/` and their SHA-256 hashes are stored in D1.
