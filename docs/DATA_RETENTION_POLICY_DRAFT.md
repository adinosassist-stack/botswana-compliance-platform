# Data Retention Policy — Review Draft

**Status: DRAFT — legal/privacy approval required.**

Define retention by data class rather than keeping all SaaS records indefinitely.

| Data class | Proposed operational default | Launch action |
|---|---:|---|
| Account/security audit | 24 months | Validate against security/legal needs |
| Active company workspace | Life of account | Customer export/deletion process required |
| Evidence files | Customer-controlled + defined legal hold | Add configurable policy before broad evidence use |
| Employee/case metadata | Customer-controlled + employment/dispute need | Obtain Botswana employment/privacy review |
| Expired sessions | Immediate/hourly cleanup; revoked records short residual period | Implemented |
| Failed/pending uploads | 7 days | Add scheduled cleanup job |
| Billing records | Statutory/accounting period | Validate with accountant/tax adviser |
| Support tickets | 24 months | Confirm operational need |
| Backups | Rolling encrypted schedule | Define provider-specific expiry |

## Rules
- Apply legal hold where a dispute/investigation requires preservation.
- Do not silently delete evidence under active legal hold.
- Record destructive administrative actions in server audit.
- Tenant/account closure requires export option, controlled deletion and backup-expiry handling.
- Review this schedule at least annually and whenever Botswana law or regulator guidance changes.
