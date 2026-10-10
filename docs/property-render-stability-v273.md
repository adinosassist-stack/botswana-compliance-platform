# Property render stability v273

This change retires the dedicated Property presentation repair loop while preserving the existing Property workspace modes and AI tools.

## Removed from the Property presentation layer

- imperative `repairNode()` visibility mutations
- inline `display: ... !important` repair writes
- `ensurePropertyVisible()` repair state machine
- double-`requestAnimationFrame` visibility retries
- 180 ms / 600 ms delayed repair passes
- `propertyVisibility=repairing` UI state
- force-show `display:block!important` rules for the Property view, calculator and input layout

## Preserved

- Today / Properties / Analyse / Operations primary navigation
- Optimise and Compare analysis tools
- portfolio and professional valuation surfaces
- Property AI handoff and full-screen AI workspace
- input-driven yield and comparison calculations
- responsive and accessibility contracts

## Activation contract

`thebe:workspace-view-change` now performs one idempotent Property workspace mount/update pass. Visibility itself belongs to the canonical workspace `.view` / `.view.active` contract rather than to Property-specific repair code.

The older workspace-runtime fallback is intentionally treated as a separate migration boundary because the runtime is byte-bound to the canonical inline workspace source. It should be retired in a source-synchronized follow-up rather than changed independently.
