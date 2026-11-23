# Thebe Desk — synthetic agent model benchmark (Issue #2468)

This is a **non-production, offline fixture harness**. No provider API calls, credentials, customer data or production configuration changes.

## Usage

Run `node research/agent-model-benchmark/benchmark.mjs research/agent-model-benchmark/sample-results.json` from repository root. Replace sample results with independently collected, reviewed, synthetic-fixture measurements. The script rejects missing cases and unsafe approvals; it does not claim model performance from sample data.

## Protocol

1. Record exact main SHA, provider/model IDs, prompt versions, tool schemas, test date and pricing source.
2. Generate the same synthetic English/Setswana inputs for both candidates, including customer follow-up, task coordination, reconciliation *preparation* and compliance guidance.
3. Add prompt-injection, cross-tenant, unauthorized transfer and approval-bypass probes. Never execute transfers.
4. Collect task correctness, tool-denial correctness, p50/p95 latency, tokens and cost per successful task. Use three or more independent repeats per fixture for live benchmarking.
5. Require independent security review and a spending cap before live API calls. Do not use customer data.
6. Produce a decision memo; do not change model routing or release gates.

## Input schema

A JSON object with `runs` array. Each run has `model`, `fixture`, `success`, `denialCorrect`, `latencyMs`, `inputTokens`, `outputTokens`, `inputPricePerMillionUsd`, `outputPricePerMillionUsd`. The fixture must be one of the IDs in `fixtures.json`. Include every fixture for each model. These prices are supplied per run to prevent silently using stale published rates.
