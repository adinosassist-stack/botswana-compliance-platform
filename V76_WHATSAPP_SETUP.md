# v76 — Meta WhatsApp Utility Notification Setup

## Scope

v76 sends only approved utility templates for existing Thebe Desk obligations, risk controls and management alerts. It does not enable marketing broadcasts, free-form bulk messaging, employee surveillance or automated disciplinary notices.

The connector is disabled until every production gate below is complete.

## Production gates

1. Create or select the Meta Business Portfolio, WhatsApp Business Account and production business phone number.
2. Obtain the Cloud API phone-number ID and production access token with the minimum required WhatsApp messaging permissions.
3. Create and obtain approval for all six utility templates using the exact parameter order below.
4. Configure `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` and `WHATSAPP_TEMPLATE_MAP_JSON`.
5. Store `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` as Cloudflare secrets. Never place live values in source, ZIPs, screenshots or support tickets.
6. Configure the callback as `https://<production-domain>/api/webhooks/whatsapp`, complete the verification handshake and subscribe the app to WhatsApp `messages` webhooks.
7. Confirm the Notification workspace reports six of six template mappings and allows consent capture.
8. Test consent, quiet-hour deferral, delivery, read, failure, retry, dead-letter resolution and revocation with real Botswana devices before enabling customer accounts.
9. Confirm current Meta charges and tax treatment, then compare observed provider spend with the plan allowances before expanding them.

## Required utility-template contract

| Internal key | Suggested Meta template | Body parameters in order |
|---|---|---|
| `obligation_due` | `bw_obligation_due` | `{{1}}` obligation title; `{{2}}` due date/time; `{{3}}` urgency level |
| `compliance_schedule_due` | `bw_compliance_schedule_due` | `{{1}}` schedule type |
| `daily_operations_summary_ready` | `bw_daily_operations_summary_ready` | `{{1}}` report date; `{{2}}` report count; `{{3}}` reporting coverage |
| `critical_business_risk` | `bw_critical_business_risk` | `{{1}}` risk title; `{{2}}` category; `{{3}}` severity |
| `control_assurance_stale` | `bw_control_assurance_stale` | `{{1}}` control key; `{{2}}` freshness state; `{{3}}` reason |
| `performance_intelligence_alert` | `bw_performance_intelligence_alert` | `{{1}}` report date; `{{2}}` location; `{{3}}` signal type; `{{4}}` severity; `{{5}}` factual explanation |

Template names may differ, but the environment map must bind each internal key to the approved Meta name and language. All six mappings are required before the connector reports ready.

## Configuration example

```text
WHATSAPP_PHONE_NUMBER_ID=<production phone number id>
WHATSAPP_GRAPH_VERSION=v26.0
WHATSAPP_TEMPLATE_MAP_JSON={"obligation_due":{"name":"bw_obligation_due","language":"en_US"},"compliance_schedule_due":{"name":"bw_compliance_schedule_due","language":"en_US"},"daily_operations_summary_ready":{"name":"bw_daily_operations_summary_ready","language":"en_US"},"critical_business_risk":{"name":"bw_critical_business_risk","language":"en_US"},"control_assurance_stale":{"name":"bw_control_assurance_stale","language":"en_US"},"performance_intelligence_alert":{"name":"bw_performance_intelligence_alert","language":"en_US"}}
```

The access token, app secret and verification token must be injected through Cloudflare secrets.

## Consent and privacy contract

- The user must actively tick the utility-reminder consent statement.
- The launch formatter accepts an eight-digit Botswana mobile number beginning with `7` and normalizes it to `+267XXXXXXXX`.
- Format validation is not proof that the user owns the number; the UI states this limitation.
- API/UI reads expose a masked number only. Audit events retain the consent version and last four digits, not the full number.
- Revocation disables the preference and cancels queued WhatsApp notifications for that user. A message already accepted for processing by the provider may not be recallable.
- Consent records and delivery events remain tenant-scoped.

## Delivery-state contract

The Graph API response moves a notification only to `accepted`. Signed Meta webhooks may advance it to `sent`, `delivered`, `read` or `failed`. Older or duplicate events cannot regress a more advanced state. Asynchronous failure enters the existing dead-letter workflow.

The outbox uses a processing claim and stale-claim recovery to prevent overlapping cron executions from sending the same row concurrently. Unique external dedupe keys prevent repeated fan-out for the same recipient and business event. A network timeout after Meta accepted a request can still create an ambiguous outcome; operations must inspect provider events before manually resending.

## Monthly plan allowances

| Plan | Monthly WhatsApp reminder reservations |
|---|---:|
| Monitor | 20 |
| Protect | 80 |
| Control | 300 |
| Network | 1,000 |
| Partner | 2,000 |

The allowance is reserved when a unique WhatsApp outbox row is created, before provider spend. Duplicate rows do not consume another reservation. These are cost-protection limits, not a promise that every reserved message will be delivered.

## Authoritative implementation references

- [Meta WhatsApp Cloud API getting started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Meta WhatsApp webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Meta messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages)
- [Meta Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/)


## Finance and connection-test extension (v79.1)

- Owners and managers can queue a real connection test from Notification settings after explicit consent.
- The API returns `queued`, not `delivered`; delivery truth still comes only from the signed Meta status webhook.
- Reconciliation exceptions can generate an urgent WhatsApp utility alert when the optional approved template below is mapped. If it is absent, the authoritative finance result remains in Thebe Desk and WhatsApp delivery is skipped safely.
- This extension does not permit payment execution, journal posting, bulk marketing, or free-form unsolicited messages.

| Optional internal key | Suggested Meta template | Body parameters in order |
|---|---|---|
| `finance_reconciliation_exception` | `bw_finance_reconciliation_exception` | `{{1}}` account name; `{{2}}` statement period; `{{3}}` absolute difference in BWP |

Add the optional mapping beside the six required mappings:
`"finance_reconciliation_exception":{"name":"bw_finance_reconciliation_exception","language":"en_US"}`.
