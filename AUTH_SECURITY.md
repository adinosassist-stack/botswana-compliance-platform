# Authentication & Recovery v21

Added:
- Google/Facebook OAuth
- explicit account linking/unlinking
- active-session listing
- sign-out-everywhere
- password reset request/complete flow
- reset token HMAC hashing and expiry
- all sessions invalidated after password reset
- first-run onboarding completion endpoint

Production email delivery still requires a transactional email provider. Reset responses are intentionally generic to avoid account enumeration.
