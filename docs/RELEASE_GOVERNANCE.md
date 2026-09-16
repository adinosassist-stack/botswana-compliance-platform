# Thebe Desk Release Governance

## Owner-authorized evidence-based release control

Thebe Desk is currently operated as a single-owner repository. For this operating model, an independent GitHub pull-request approval is **recommended but is not a mandatory release authority**.

The repository owner may authorize a release without a separate human reviewer only when all of the mandatory evidence gates below are satisfied. This is an explicit governance policy, not a silent bypass of review.

## Mandatory pre-merge gates

A release candidate may merge only when all of the following are true:

1. The pull request is open, non-draft, mergeable, and bound to an immutable full 40-character head SHA.
2. A documented three-pass adversarial review has been completed against that exact candidate. The passes must cover:
   - source/scope authority and unintended change drift;
   - runtime/security bypasses and fail-open behavior;
   - release-evidence integrity and false-assurance risks.
3. `Audit remediation CI` (or its successor exact-head qualification workflow) succeeds on the exact pull-request head SHA and proves the checkout SHA before testing.
4. Recovery CI succeeds against the current pull-request merge ref.
5. Mobile startup recovery succeeds against the current pull-request merge ref.
6. Legacy-orphan qualification succeeds against the current pull-request merge ref.
7. No unresolved confirmed security or release-governance finding remains open.
8. Customer activation remains `HOLD` unless a separately reviewed activation change explicitly moves it to `cohort` or `open`.

A green CI result alone is not sufficient. The exact-head adversarial review and the full evidence chain above are jointly required.

## Mandatory post-merge release gates

Merging an application pull request does **not** authorize production deployment by itself. After merge:

1. Regenerate release metadata and BF-07 evidence from the final merged source.
2. Require successful Recovery CI and BF-07 sealing for the exact release authority SHA.
3. Deploy only that exact qualified SHA through the governed production deployment workflow.
4. Require exact-SHA desktop/mobile post-deploy smoke evidence.
5. Run the Production audit replay against the exact deployed current-main release SHA.
6. Prove live `/api/version` provenance matches the release authority.
7. Run the mandatory signed synthetic lifecycle: registration -> authenticated workspace -> deletion request -> cleanup.
8. Run zero-orphan verification and require success.
9. Keep customer activation on `HOLD` until all live exact-SHA checks above are green.

## Human review

Independent human review remains desirable for material architecture, security, financial, legal/compliance, and delegated-authority changes. Its absence must never be represented as an independent approval. When no independent reviewer is available, the owner-authorized evidence-based control above is the release authority.

## Policy-change rule

Any future weakening, removal, or material alteration of these gates must be explicit, documented in the repository, create a new source SHA, and pass the same applicable qualification workflows before it can take effect.
