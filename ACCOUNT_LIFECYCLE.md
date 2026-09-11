# Account lifecycle v22

Added:
- transactional email abstraction (Resend hook + provider interface)
- password-reset delivery via configured provider
- onboarding status endpoint and welcome banner
- account data export
- account deletion request workflow with retention/legal-hold review
- account/session/social controls from previous releases retained

Production requirements:
- configure EMAIL_PROVIDER, EMAIL_FROM, and provider credentials
- publish retention/deletion policy
- define operational SLA for deletion requests
