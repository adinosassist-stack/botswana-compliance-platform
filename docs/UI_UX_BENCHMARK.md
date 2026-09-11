# UI / UX Benchmark — v14

## Reference patterns
- Linear 2026 UI refresh: calmer interface, consistent headers/navigation/view controls, dimmer sidebar so content dominates.
- Vanta Home: priority tasks, compliance progress, monitoring, direct drill-down into items needing attention.
- Stripe Dashboard: predictable operational summaries and clear navigation across workflows.
- Deel: reduce admin friction, surface status and actionability close to the task.

## Applied to BW Compliance OS
- Grouped sidebar by user job rather than a flat feature list.
- Quieter sidebar and stronger main-workspace contrast.
- Sticky command header with quick navigation.
- Dashboard prioritizes today’s compliance work before secondary reporting.
- Denser KPI cards, tables and badges for faster scanning.
- Source conflicts shown as controlled review states rather than panic banners.
- Tighter mobile layout, forms, focus states and touch behavior.
- No reduction of legal-safety, RBAC, tenant, evidence or rule-publishing controls.


## v15 interaction hardening
- Added command palette navigation (`Ctrl/Cmd+K` or `/`) so a dense compliance product remains fast without surfacing every destination at once.
- Added mobile bottom navigation for Home, Actions and Evidence; full navigation moves behind command search on narrow screens.
- Added Next Best Action to make the dashboard decision-oriented rather than metric-only.
- Added workspace setup completion to guide new customers toward useful configuration.
- Improved empty states, keyboard focus, skip-to-content access, `aria-current`, and live navigation announcements.
- Reduced mobile header actions so the primary action remains visible while secondary actions stay out of the way.

Design principles retained from the benchmark: quiet navigation, priority-first home, predictable operational density, and minimal administrative friction.
