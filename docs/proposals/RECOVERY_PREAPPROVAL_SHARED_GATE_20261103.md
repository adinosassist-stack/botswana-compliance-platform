# Consolidated recovery preapproval gate — isolated operations and backup integrity

This change validates exact manual dispatch identity **before** entering the independently reviewed `operations-rehearsal` GitHub environment. It addresses the stale-SHA approval-queue issue for two existing recovery workflows without modifying their behavior after approval.

## What changes

- `isolated-operations-rehearsals.yml`: before protected reviewer queue, fail if expected SHA differs from workflow run SHA, branch is not main, repository/event is incorrect, confirmation is not exact, or the selected operation mode is unsupported.
- `private-backup-integrity.yml`: the same source/confirmation check applies before the protected, fixed historical candidate integrity inspection.
- `scripts/verify-protected-recovery-dispatch.mjs`: credential-free, no-provider validation shared by both workflows. A pass is only eligible to request an independent review, not an approval.
- `tests/protected-recovery-dispatch-preapproval.test.mjs`: adversarial cases for stale SHAs, malformed SHAs, branch/repository mismatch, confirmation mismatch, unsupported modes and preapproval workflow placement.

## Unchanged approvals and boundaries

The protected `operations-rehearsal` environment stays mandatory; successful preapproval is not authorization. Existing exact checkout and live-main checks in the protected `isolated-operations-rehearsals.yml` job stay in place. The private integrity executor still uses the older fixed candidate with its original pinned SHA-256 hashes, rather than silently substituting the two new production backup objects. All manual runs remain serialized with `cancel-in-progress: false`.

**Important:** This does not create a new versioned restore workflow, accept a backup, authorize restoration, change retention, perform Cloudflare writes or migrate production POP. The new restore target remains reserved and empty until separately approved.

Independent reviewer: `thusico`; issue tracking: #1950. Do not merge unless all required checks pass, the review is approving, and governance rules remain active.
