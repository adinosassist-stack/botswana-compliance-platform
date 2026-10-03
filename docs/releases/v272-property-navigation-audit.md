# V272 Property navigation and complete UI deployment audit

Property exposes four primary destinations: Today, Properties, Analyse and Operations. Optimisation and comparison remain accessible as contextual analysis tools. Their active state keeps Analyse selected, and the calculator's recovery logic respects the current destination rather than exposing an off-screen pane. Existing operations, comparison, optimisation, valuation permissions and full-screen Property AI remain intact.

Dynamically mounted Property styles now carry the qualified release identity, closing a cache boundary that previously escaped HTML asset versioning. The current emergency dock geometry correction is included from main, along with the merged V270/V271 voice compatibility foundation; these foundations retain the existing production voice provider and do not enable an unqualified provider migration.

Verification includes a regression that fails on the six-tab baseline, runtime pane-state and release-URL checks, Chromium desktop/mobile navigation coverage, existing Market fragment parity, pricing, employee reconciliation and dock geometry gates, and the full project test suite. A post-deployment proof checks the live release identity, exact Property and recovery asset bytes, and the live Property/Market lazy fragments. Authenticated customer data must not be modified during this audit.

A live visual audit also found that the standalone pricing card used flex without a column direction, compressing the plan heading, price, description and CTA into one row. The card now stacks these elements vertically, and the existing five-plan desktop/mobile Chromium test verifies their order and containment.
