# Corporate Assets future staging candidate — read-only metadata gate

This package is intended for the moment a **separately approved** source-upload procedure creates a new *undeployed* version. This PR does NOT create one, call a deployment API, or authorize an upload.

The pure `checkFutureVersionMetadata` verifier requires:
- a **new** numbered version, not old v2 or historical v3; exact reviewed SHA binding and Cloudflare script ETag;
- isolated D1 identity, secret_text binding types, all asset/payment/AI/write flags disabled and registration held;
- complete unambiguous deployment metadata still showing v2 serving 100%, no candidate traffic;
- complete custom-domain and route inventories that do not expose the Worker, and Workers.dev and preview URLs disabled;
- locally recorded SHA-256 executable digest (metadata only).

A green metadata result is **not proof** of byte-for-byte Cloudflare upload or secret-value continuity. The function always sets `uploadedCompiledBytesVerified:false`, `independentSourceProvenanceVerified:false`, `credentialValueContinuityVerified:false`, `versionCreationAuthorized:false`, and `deploymentAuthorized:false`. Caller-provided asserted proof cannot override that.

To close the remaining gap, an independently reviewed protected upload process must capture authenticated actual-upload artifact evidence, verify the accepted Cloudflare version and bindings after upload, and preserve the separate owner and `thusico` approvals. Never promote the old v3 solely from a source SHA label or ETag. No production changes.