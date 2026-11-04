# Protected versioned restore metadata preflight — review-only

This workflow extends the already-merged offline preflight with an opt-in protected read-only **workflow_dispatch**. It runs only against the exact live main SHA; an unprotected qualification step checks current main **before** requesting the `operations-rehearsal` review, and the protected job checks it both before and after three Cloudflare GET requests.

The only provider requests are: read the exact R2 lock policy, list object metadata for the fixed historical candidate key prefix, and fetch metadata for the isolated empty target D1. No SQL bytes, credentials, object contents, customer data, mutations, D1 import, Time Travel restore, or backup deletion are performed. The entire job shares the isolated-operations serialization group; review approval cannot be substituted by a chat message. Failure or stale main stops the run.

A successful observation still explicitly returns HOLD and **never authorizes restore or public deployment**. The reviewer must separately assess storage/access isolation and object-level enforcement; an actual versioned isolated SQL import requires a new explicitly reviewed, owner-authorized protected workflow with byte hash, full preflight, and postimport FK/tenant checks. This PR adds no import path.
