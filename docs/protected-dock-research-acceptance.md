# Protected Dock research acceptance

Tracking issue #2735. Source baseline `8266bb0ee0e5c9712fd2e66df77545c843660398` includes #2892 and #2893. This is an integration proposal for independent review.

## Integration

Use an authenticated isolated staging workspace serving the reviewed Dock assets. Protect its hostname with the existing staging access controls. Route the browser's same-origin `POST /api/ai/general` to `bw-general-ai-staging` through an internal service binding. Keep the General AI Worker private with Workers.dev, previews, and public routes disabled. Both research flags default off.

The General AI entry verifies a fixed origin and reads its own tenant-bound session and CSRF records. A Workspace Agent preview session is valid only in its own auth store. The staging workspace and research backend need a reviewed shared synthetic staging session authority before the request can be relayed. Require an authenticated synthetic workspace session and matching CSRF at the staging ingress, then validate the same session and tenant again at the research backend. Any internal origin mapping must use a fixed reviewed origin and occur only after ingress validation. Reject cross-origin requests, arbitrary upstream destinations, and any production database or session binding. Keep the OpenAI credential on the research Worker and out of the browser.

## Evidence

1. Verify the deployed Dock and backend identities against the reviewed revision. Capture the baseline flag and binding states.
2. After independent review and protected staging approval, use a run-scoped synthetic tenant and a short-lived session. Qualify negative authentication and CSRF cases before executing the fixed research prompt with the dedicated staging provider credential and an approved request budget.
3. At mobile width, ask “Search the live web for Botswana’s official 2022 census population and cite Statistics Botswana.” Require a cited research response, the figure **2,359,609**, and a clickable HTTPS citation that resolves to the official Statistics Botswana census source. Record final citation URL, outcome, deployed identifiers and time. Keep session material out of evidence.
4. Verify the unavailable message with research disabled. Restore staging flags, remove run-owned fixtures and any temporary credentials, and verify cleanup. The #2892 backend capital-city smoke test provides separate provider evidence.

Official expected result: https://www.statsbots.org.bw/census-population-2022
