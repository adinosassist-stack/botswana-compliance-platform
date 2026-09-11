# Google and Facebook Sign-In

Implemented server-side OAuth entry points:

- `/api/auth/oauth/google/start`
- `/api/auth/oauth/google/callback`
- `/api/auth/oauth/facebook/start`
- `/api/auth/oauth/facebook/callback`

## Required production setup

### Google
Create a Web OAuth client in Google Cloud and set the exact authorized redirect URI:
`https://YOUR_DOMAIN/api/auth/oauth/google/callback`

Request only `openid email profile`.

### Facebook
Create a Meta app with Facebook Login and set:
`https://YOUR_DOMAIN/api/auth/oauth/facebook/callback`

Request only `email,public_profile`.

## Security
- provider secrets stay server-side
- signed state parameter protects the callback
- state is also bound to an HttpOnly SameSite=Lax cookie
- social identities link to the existing local user by verified email where available
- provider IDs are stored separately in `external_identities`
- sessions remain the application's own HttpOnly session cookies
- do not treat provider access tokens as application sessions

## Account linking safety

- Google sign-in only auto-matches an existing local account when Google reports the email as verified.
- Facebook does not auto-link to an existing local account by matching email alone. The user must first sign in using the existing method and explicitly link Facebook.
- `FACEBOOK_GRAPH_VERSION` is configurable so the deployed app can follow Meta's currently supported Graph API version without source-code changes.

## v20 account management

- Users can view linked Google/Facebook identities under **Sign-in & Accounts**.
- Existing signed-in users can explicitly link a provider.
- Provider identities cannot be linked to two local users.
- Disconnecting the only usable login method is blocked.
- Link/unlink events are written to the authoritative server audit log.
- OAuth cancellation/error states return to the app with user-facing feedback.
