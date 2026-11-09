# Corporate Assets: full protected read-only audit

After PR #2330, the source-marker/metadata gate and the account-wide exposure gate were separate. This batch combines them under the existing `corporate-assets-staging-protected` read-only workflow.

The script executes the authenticated exact-main preflight FIRST. It verifies the current GitHub main SHA and independent `thusico` environment policy, then reads Cloudflare version/deployment metadata. It then independently reads the Cloudflare Workers.dev setting, account Worker domains, the full expected zones inventory, and every expected zone's Worker routes. All API requests are GET-only.

The read-only evidence requires the historical v3 mismatch to remain explicitly acknowledged. Even a green exposure result only proves private exposure and metadata; it cannot prove source-to-upload byte provenance, secret values or authorise creating or deploying a Worker. These fields remain false in the receipt.

If Cloudflare lacks permissions to read the full zone inventory, the audit fails closed: request a purpose-scoped read token rather than bypassing the check. No PR runs receive environment secrets. Manual dispatch is limited to the exact current main under independent `thusico` protection.

This is not a new source upload. Staging v2 remains at 100%, historical v3 remains undeployed, asset writes remain disabled, and production is unchanged.