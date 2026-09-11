# BW Compliance OS — P0/month Cloudflare architecture

## Launch target
Keep Cloudflare hosting at **P0/month** while the product is small.

### Current Cloudflare Free allowances used by this design
- Workers: 100,000 requests/day; 10 ms CPU/request
- D1: 5 million rows read/day, 100,000 rows written/day, 5 GB storage total, 500 MB per DB
- R2 Standard: 10 GB-month storage, 1 million Class A ops/month, 10 million Class B ops/month, free egress
- Pages/static assets: free/unlimited requests; 500 builds/month

## Product implications

### Keep on free tier
- SME compliance dashboard
- Employer Shield records/checklists
- Tender readiness scoring
- Company Secretary reminders
- Licence tracking
- Compliance Passport metadata
- rule/news summaries already curated into D1
- Google/Facebook login
- account export
- evidence vault for modest document volumes

### Gate or meter
- AI tender-document analysis
- OCR
- malware scanning SaaS calls
- high-volume email/WhatsApp delivery
- large evidence storage
- bulk document generation
- regulatory web crawling
- professional marketplace transactions

Those may have external-provider costs even if Cloudflare itself remains free.

## Recommended free-launch scale

Design target:
- 100–500 active SMEs
- fewer than ~3,000 authenticated API calls/day initially
- fewer than 500 new/changed records/day
- evidence average below 2–3 MB/file
- 10 GB R2 cap guard at 8 GB
- 500 MB D1 database cap guard at 350 MB

These are internal safety thresholds, not Cloudflare guarantees.
