# v78 — Business Protection Copilot & Accessible Motion

## Outcome

v78 adds a read-only, evidence-grounded AI assistant to AI Services and upgrades workspace motion without changing the v75 pricing model or removing tendering. The copilot is a management aid. It does not file, send, approve, mutate workspace data, decide employment matters or promise tender eligibility or award.

## Copilot modes

| Mode | Purpose |
|---|---|
| `ask` | Answer a bounded question from current workspace records. |
| `next_actions` | Prioritise current operational and compliance follow-up. |
| `explain_risk` | Explain the strongest recorded business-protection risk and its evidence references. |
| `management_brief` | Produce a concise management view of current workspace state. |
| `tender_readiness` | Summarise active tenders and mandatory readiness gaps. Tendering remains active. |

## Data boundary

The Worker constructs the model context server-side and tenant-scopes every company-data query. It may include:

- a minimised business profile without turnover or personal names;
- open compliance obligations and their approved official-source references;
- open/acknowledged business risk events;
- tenant control status and evidence-health labels;
- active tender titles, issuer, closing date and aggregate mandatory-gap counts;
- current CIPA reconciliation counts, not registry evidence bytes;
- the latest protection score and aggregate Daily Operations metrics.

It excludes evidence/document bytes, employee names, employee reports, HR case narratives, credentials, environment secrets, raw audit events and payment details. Serialized context is capped at 24,576 bytes. Questions are capped at 1,000 characters and request bodies at 8,192 bytes.

When Workers AI is configured, the question and bounded context are processed by the configured Cloudflare model. The application stores only run metadata, context counts, credits used, an output hash and a bounded error code. It does not store the question or generated answer.

## AI safety and cost controls

- Model default: `@cf/zai-org/glm-4.7-flash` through the existing `AI` binding.
- Optional override: `AI_ADVISOR_MODEL`.
- Output: required JSON schema with bounded strings and arrays.
- Tool/function execution: disabled; no tools are supplied to the model.
- Prompt injection: question and workspace records are explicitly delimited and treated as untrusted data.
- References: returned labels are filtered against the server-created reference allowlist.
- Rendering: generated content is inserted through `textContent`/DOM nodes, never trusted as HTML.
- Cost: six application AI credits per Workers AI run.
- Limits: existing monthly credit/provider-cost hard stops plus ten completed/fallback runs per tenant per minute.
- Failure: provider or output-validation failures refund the originating tenant wallet or partner pool and return a labelled structured fallback.
- Missing binding: structured fallback, no AI claim and no credit charge.

## Motion system

v78 adds short view-entry and copilot-response transitions, bounded staggered reveals, progress interpolation and hover lift for fine-pointer devices. Motion is limited to opacity and transform where practical to avoid layout shift. `prefers-reduced-motion: reduce` disables nonessential animation, transitions and smooth scrolling. Copilot loading state uses `aria-busy` and a polite live region.

## Deployment

Apply migrations in order, ending with:

```text
cloudflare/migrations/020_v78_ai_copilot_motion_security.sql
```

The migration is additive and creates only `ai_advisor_runs`. It does not alter or delete tender tables or tender data.

Run the focused gate:

```bash
npm run test:ai-v78
```

Run the full release gate before deployment:

```bash
npm test
```

No deployment is performed by this package build.
