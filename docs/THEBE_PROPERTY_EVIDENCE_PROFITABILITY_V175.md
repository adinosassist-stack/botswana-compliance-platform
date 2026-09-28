# Thebe Property Evidence & Profitability v1.1

Property v175 extends the canonical Property Portfolio and Professional Valuation layer introduced in v174. It does not create a second property system.

## Signed valuation-report evidence

A professional valuation can now reference one signed-report document from the tenant Evidence store. The link is accepted only when the evidence record:

- belongs to the same tenant;
- is not deleted;
- has human review status `approved`;
- has malware scan status `clean`;
- has a recorded scan timestamp; and
- has no malware finding.

The valuation row and the valuation-to-evidence link are immutable. Existing v174 valuations can receive a signed-report evidence link later without changing the professional valuation record itself.

Production evidence uploads remain governed by the existing Evidence safe-launch controls. v175 does not bypass or re-enable disabled upload routes.

## Valuation review reminders

An owner may record a review/renewal date stated by the professional report. When none is supplied, Thebe derives a 365-day workflow reminder from the valuation date.

That reminder is an operational control only. Thebe does not claim that a valuation legally expires after 12 months and does not replace the professional valuer's judgment.

## Controlled property record changes

Owners and managers may maintain active property operating facts. Status changes are owner-only. Archiving requires an archive reason and preserves the property, valuation history and operating history.

Archived records remain visible and managers cannot mutate them. The owner may reactivate an archived property through the governed edit path.

## Property profitability history

Thebe records an immutable operating snapshot when a property is created and whenever recorded annual rent, annual operating cost or debt balance changes.

Derived property measures include:

- annual rent;
- annual operating cost;
- net operating income proxy = annual rent minus annual operating cost;
- recorded debt;
- gross rent yield against the latest recorded external professional value; and
- NOI proxy yield against the latest recorded external professional value.

These are management analytics, not audited accounting profit. The NOI proxy does not automatically include vacancy, financing cost, tax, depreciation, capital expenditure, unrecorded expenses or other accounting adjustments.

## Authority boundary

Thebe continues to:

- store owner/manager-entered property operating records;
- preserve signed professional valuation evidence;
- calculate transparent management ratios and trends; and
- surface missing evidence and valuation-review reminders.

Thebe does **not** create, certify, sign or independently verify a professional property valuation, and it does not independently verify a valuer's registration.
