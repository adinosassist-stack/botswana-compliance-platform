# v27 — Cloudflare Workers Paid expansion

## Baseline
Use Workers Paid at the current minimum charge of US$5/month.

Current included usage:
- 10 million Worker requests/month
- 30 million CPU milliseconds/month
- no hard request count limit
- D1: 25 billion rows read/month included
- D1: 50 million rows written/month included
- D1: 5 GB included storage, 10 GB maximum per database on Paid
- D1: up to 1 TB storage/account
- R2 remains usage-priced after its free monthly allowance
- Workers AI retains 10,000 free neurons/day; overage is usage-priced

## Platform expansion enabled
- richer TenderReady workflows
- Employer Shield 2.0
- Company Secretary
- LicenceOS
- Compliance Passport
- Partner Portal
- Workflow Hub
- queue-backed reminders/reviews
- optional AI services
- higher-volume multi-company dashboards

## Still avoid
- always-on VM/container
- dedicated PostgreSQL unless scale truly demands it
- unrestricted AI
- uncontrolled crawling
- document bytes in D1
- per-customer isolated Workers unless Workers for Platforms becomes necessary

The target is a much larger SaaS on a predictable low-cost serverless base.
