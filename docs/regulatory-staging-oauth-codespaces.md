# Regulatory staging bootstrap from GitHub Codespaces (OAuth, no API token)

This is an **alternative manual staging-only procedure**, not a replacement for
the protected GitHub Actions environment approval. It requires independent
authorization before any write. It does not activate production or import
regulatory source data.

## Prerequisites

- Authorized Cloudflare account owner who can edit the **staging** D1 database.
- Access to a repository GitHub Codespace (browser terminal), Node 22+,
  npm, npx, git, and curl.
- Independent approval to perform the one-time manual staging baseline.

1. Open https://codespaces.new/adinosassist-stack/botswana-compliance-platform
   (select `main`) and open **Terminal**.
2. Ensure Node 22 is active, if needed: `nvm install 22 && nvm use 22`.
3. Run **read-only preflight**:

   ```bash
   bash scripts/regulatory-staging-oauth-bootstrap.sh
   ```

   If Cloudflare authorization is needed, the script prints a device-login
   URL and code. Sign in to the **existing** Cloudflare account in your
   browser; never paste credentials or device tokens into chat.

4. Verify `PREFLIGHT SUCCESS. No database changes were made.` and obtain
   independent approval for the manual alternative.

5. Only after approval, run the one-time baseline import:

   ```bash
   bash scripts/regulatory-staging-oauth-bootstrap.sh --apply
   ```

   Type `INITIALIZE_EMPTY_STAGING` only after confirming the database is
   empty and no other operator will write concurrently.

## Safety

- Scope is permanently set to staging UUID
  `20c0d37e-552e-438f-a56d-3f12c27d38e2` under account
  `ddd23cab31928a4bb3d4998df9b26d1d`; the known production UUID is
  explicitly rejected.
- It verifies the exact name and UUID via authenticated D1 listing, confirms
  schema emptiness, and validates the SQL blob against immutable reviewed
  commit `8f59788351662c5cbb22bc0da01ba104d2142b31`.
- `--apply` performs a second emptiness check and then imports
  `cloudflare/schema.sql` with Wrangler. An unsuccessful remote import
  **may be partial**: inspect remote D1; never blindly rerun.
- A successful import verifies schema presence and zero rows in selected
  business/regulatory tables. Regulatory v1.8 review and import qualification
  remain separate.

Cloudflare documentation:
- https://developers.cloudflare.com/changelog/post/2026-08-04-wrangler-login-device-flow/
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
