# Batched synthetic staging evidence — offline comparator

This component is **NOT** the remote fixture writer, importer, or authorized read-only attestor.
It cannot prove that its input was obtained from Cloudflare or approved by a human.
It accepts structured snapshots from a separately independently reviewed and authenticated staging reader and performs exact, order-sensitive checks on historical obligations, due-date schedules, snapshots and reviews. The v1.8 draft and v1.7 review status remain unactivated, and a retry must be identical to the after state.

A future implementation MUST bind the independent authorization verifier to immutable GitHub protected-environment approval, actual operator and distinct reviewer identities, exact current SHA, Cloudflare verified UUID/name, separately approved fixture hash, and concurrency/recovery evidence. **Never accept caller-supplied booleans as proof of approval**; the existing pure authorization validator only validates input shape. An authenticated reader must enforce synthetic-row selection, schema projections, bounded non-PII output, stable ordering, integrity and full counts. Any unknown tenant or existing regulated record must fail closed.

Execution remains blocked until that future separate runner and official-source/legal maker-checker review pass. No production writes, automatic publication, or customer data import.
