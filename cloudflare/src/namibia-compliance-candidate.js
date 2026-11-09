// Research candidate only. This module is deliberately NOT registered as an active regulatory pack.
// Human legal/tax review and source-effective-date verification are required before activation.
export const NAMIBIA_CANDIDATE_VERSION = "2026-11-07.v1";
export const NAMIBIA_CANDIDATE = Object.freeze({
  marketCode: "NA",
  country: "Namibia",
  currency: "NAD",
  status: "research_candidate",
  productionEnabled: false,
  regulatoryPackKey: "namibia-compliance-candidate-v1",
  reviewedBy: null,
  approvedAt: null,
  domains: Object.freeze([
    {
      key: "bipa_annual_returns",
      authority: "BIPA",
      obligation: "Track applicable annual-return and annual-duty requirements for registered entities.",
      scope: "entity_type_dependent",
      deadlinePolicy: "review_required",
      source: "https://www.bipa.na/annual-duty/",
      evidence: ["entity_registration", "financial_year_end", "annual_return_receipt", "annual_duty_receipt"],
      automation: "reminder_draft_only"
    },
    {
      key: "bipa_beneficial_ownership",
      authority: "BIPA",
      obligation: "Maintain beneficial-ownership declarations and monitor changes and financial-year-end reporting.",
      scope: "registered_companies_and_close_corporations",
      deadlinePolicy: "review_required",
      source: "https://www.bipa.na/beneficial-ownership/",
      evidence: ["beneficial_owner_register", "bo_declaration", "submission_receipt", "change_history"],
      automation: "reminder_draft_only"
    },
    {
      key: "namra_vat",
      authority: "NamRA",
      obligation: "Assess VAT registration, return and recordkeeping obligations using the taxpayer's verified profile.",
      scope: "threshold_and_activity_dependent",
      deadlinePolicy: "review_required",
      source: "https://itas.namra.org.na/taxes",
      evidence: ["tax_registration", "taxpayer_turnover_basis", "filing_receipt"],
      automation: "advisory_only"
    },
    {
      key: "fic_aml",
      authority: "Financial Intelligence Centre",
      obligation: "Assess whether an entity is an accountable or reporting institution before presenting AML workflows.",
      scope: "sector_and_activity_dependent",
      deadlinePolicy: "review_required",
      source: "https://www.fic.na/",
      evidence: ["activity_classification", "applicability_review", "fic_registration_if_applicable"],
      automation: "applicability_review_only"
    }
  ])
});
export function namibiaComplianceCandidate() { return NAMIBIA_CANDIDATE; }
export function namibiaCandidateActivationReadiness() {
  return Object.freeze({
    marketCode: "NA", ready: false, productionEnabled: false,
    blockers: Object.freeze([
      "independent_namibia_legal_tax_review_required",
      "source_effective_dates_and_filing_calendars_unverified",
      "regulatory_pack_approval_and_integrity_seal_missing",
      "tenant_isolation_and_migration_tests_pending",
      "independent_security_and_release_approval_required"
    ])
  });
}
