# Subscription Gate

New tenants start with a configurable trial (`TRIAL_DAYS`, default 14). Read access remains available after trial expiration, but workspace mutations and new evidence uploads return HTTP 402 until the subscription is active.

Payment-provider webhooks are intentionally not hard-coded. The production billing adapter should update the `subscriptions` row only after verifying the provider webhook signature. Raw card data must never enter BW Compliance OS.
