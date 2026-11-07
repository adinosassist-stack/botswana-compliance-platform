# General AI local-only service binding acceptance runner (review candidate)

This PR adds **only** a local development primary Worker and a local secondary Worker for an in-process negative-path acceptance harness. It is not a remote staging invocation path, authenticated staging test, or release authority. It uses Cloudflare's supported multi-config `wrangler dev` mode with a service binding; both Worker names are intentionally different from the deployed `bw-general-ai-staging`. Neither config has D1, remote bindings, real session credentials, model bindings, provider keys, R2 or a public route.

## Verify offline

Run `node --test tests/general-ai-local-private-runner.test.mjs` for no-credential disabled-state path regressions.
For independent manual local runtime validation, after verifying the configuration and a local-only runtime:
```sh
npx wrangler dev -c cloudflare/wrangler.general-ai-local-runner.toml -c cloudflare/wrangler.general-ai-local-target.toml
```
In a *separate local terminal*, call `POST http://127.0.0.1:8787/__local_ai_disabled_check` with no cookies or Authorization header. Expect HTTP 200 and `{"ok":true,"tested":3,"scope":"private-disabled-negative-paths-only"}`. This is a loopback development server, not a public production route. Do **not** use `wrangler dev --remote`, change any `remote` binding setting, or deploy these configs. No live Cloudflare resources should be contacted by these two local-only configs.

## What is still missing

No live staging HTTP or D1 auth lifecycle acceptance occurs. Before adding a Cloudflare-connected private invocation trigger, independently review its operator identity, environment governance, exact-SHA attestation, service binding permissions, no-public-route enforcement, isolated staging database scope, synthetic fixture cleanup and provider/cost controls. A local success is NOT evidence of remote staging acceptance.

Production General AI, research and advanced exports remain disabled. No customer-facing activation, D1 write, protected workflow dispatch or Cloudflare settings changes are authorized by this code.
