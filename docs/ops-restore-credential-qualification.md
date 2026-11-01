# Isolated restore credential selection

RESTORE_APPROVED_BACKUP uses the already separately authorized PRIVATE_BACKUP_CLOUDFLARE_TOKEN. It must be present; no fallback to the working read-only operations credential is allowed. Other modes retain their existing credential selection. The workflow injects the private backup credential only for restore mode, preserving existing exact-source, independent environment approval, backup hash/approval, empty-target, isolation and resource-identity checks.

This changes reviewed secret wiring, not token permissions or restore authority. No credentials are copied or rolled. The dedicated token's actual Cloudflare permissions must be inspected independently; account-level D1/R2 capability is not falsely claimed to be resource-specific. The restore runtime continues to reject production D1 and pins the restore database name/bucket paths. Full cross-service access-path and exclusive-writer inspection remain required.

Before live restore, independent thusico evidence acceptance must reference the passing actual integrity run #41351227141, SQL SHA-256 0eee6ff0bb1a99c61946b6840b1e295e8c40ba9ccd75aa01f3063c7350e50e6b and sample SHA-256 2d0aacd4d64ae5edbea558b0da15ff8edcd40966907b10574fa601ce6f25200d. Qualification success or PR approval alone does not approve private candidate bytes/provenance/retention.

After that acceptance, promote those exact verified candidate bytes privately to the two fixed approved input keys without overwriting differing data, set their reviewed hash variables and the real traceable approval reference, recheck empty isolated restore target and all private storage access paths, and dispatch RESTORE_APPROVED_BACKUP on exact reviewed current main through operations-rehearsal. No invented approval variable or public backup artifact. The user has authorized private backup and isolated restore; separate production migration authorization remains required.

No restore, SQL import, promotion, activation or production migration is performed by this code change.
