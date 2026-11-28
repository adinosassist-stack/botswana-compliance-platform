# Botswana operational launch batch — 28 November 2026

Target: 1 December 2026. Initial operational customer: Lovely Tombstones, five branches. Nonessential development frozen. This packet is source preparation, not activation or production authorization.

## Consolidated corrections

Reuse manager request correction #2867 and mobile PDF compatibility #2917 on main `2e3ba64fe86ef0ef7b24c4e1bbbc31e97afc93aa`. Preserve merged #2932 in-page confirmation and commercial-mode restrictions. Registered users can submit the owner-issued business request code; repeated submits are suppressed. Owner approval/provisioning confirmations survive successful and failed inbox refresh. Provisioning remains governed by existing flags, owner authorization and tenant/branch controls.

Saved PDF selection accepts missing/generic mobile MIME metadata only after existing size, PDF signature and filename checks. Native sharing still sends actual prepared file bytes from a user gesture, and reports unavailable/cancelled sharing truthfully. Local draft tools are collapsed away from primary PDF actions, and remain absent from commercial mode. The two-page renderer is reused unchanged. Commercial CI now exercises both editor/browser journeys and attachment checks.

## Verified environment inventory

Read-only Cloudflare inventory on 28 November:

| Surface | Observed state | Unproven requirement |
| --- | --- | --- |
| Production Worker | `bw-compliance-os`, version `4a9a43e9-a463-4813-976c-0729788b9153`, 100%, deployed 26 November | HTTP exact release identity and full signed-in operational acceptance |
| Staff / Employee Cash | Production flags `THEBE_STAFF_PORTAL_ENABLED=true`, `THEBE_EMPLOYEE_CASH_ENABLED=true` | Registration/login, report/approval and five-branch operational acceptance |
| General AI / research | Production flags both false | Governed activation and authenticated chat/cited research acceptance |
| Live voice | Production flag true; GPT live preview flag true | Successful signed-in call, founder exemption, session restart/audio acceptance |
| Private Dock | Workspace `5b0a8ee5-c193-4d69-b4b8-71529b84b451`, backend `f24ab5b3-27d6-48e2-a00b-5c0904fda40d`, both 100% | Latest deployment attempt run 46071326993 failed before activation: staging voice key missing/too short |
| Private quotations | Tracker records #2932 asset update active, app `5371f208-e012-41ef-8b10-088f784a0771` | Secure invitation delivery; hosted issuance/invoice/PDF and physical Android WhatsApp delivery |
| Company logo | Production flag false | Private persistence activation and acceptance |
| Manager access | Source correction consolidated here; no activation performed | Qualified manager deployment/flags and registration/invite/login/branch acceptance |
| Notifications | Existing source supports drag persistence, identity isolation, collision avoidance | Signed-in physical-device acceptance |
| Trial/payment | Existing implementation retained | Real settled credit, owner approval and durable purchased access across sessions |

The public home page advertises a 14-day trial and shows three pricing cards; this does not establish the five-tier pricing or trial/payment journey. Do not alter the approved five-tier commercial model based on that marketing observation.

## Verification and gates

36 integrated manager/request/PDF-share tests passed. Additional quotation workflow and isolated D1 qualification results are recorded in the PR. Local browser execution was blocked by missing Chromium; the browser download returned a network-policy 403. CI uses its existing pinned Playwright container to provide fresh browser evidence. This is an environment failure, not a product pass or failure.

Main Governance and Recovery CI at the inspected main both succeeded. Skipped migration jobs do not prove schema execution. Current production manifest is sequence 683, source `52a440f7213c1d81ad1bdb6f152edebc06b53f54`; this file alone does not prove the live release identity. Do not assign a new production sequence or repoint its provenance until consolidated source is independently reviewed and merged.

Before release qualification: finish exact-head CI, independent thusico review, secure quotation invitation handoff, valid staging-only voice credential, hosted core operational acceptance, founder entitlement verification and real manual-payment acceptance. Then prepare a fresh exact-main manifest/BF-07 seal, recovery/rollback evidence and cumulative release scope for separate exact-SHA owner authorization and independent protected production approval. No production mutation, schema change, entitlement write, access-policy expansion or deployment is performed by this batch.

Readiness: HOLD for operational launch; source fixes are reviewable but do not establish activated workflows. Continue unblocked source integration while credentials and independent gates are resolved.
