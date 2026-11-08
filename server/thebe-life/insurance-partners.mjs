/**
 * Partner catalogue contract and commission reconciliation projections.
 * Not a broker, quotation, payment, policy-binding or commission-award API.
 */
export function validatePartner(partner) {
  if (!partner || typeof partner !== 'object' || Array.isArray(partner)) throw new TypeError('invalid_partner');
  if (typeof partner.id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(partner.id)) throw new TypeError('invalid_partner_id');
  if (typeof partner.legalName !== 'string' || partner.legalName.trim().length < 2 || partner.legalName.length > 200) throw new TypeError('invalid_legal_name');
  if (partner.regulatorVerified !== true || partner.contractApproved !== true || partner.distributionPermissionVerified !== true) return Object.freeze({id:partner.id,eligibleForMarketplace:false});
  return Object.freeze({id:partner.id,eligibleForMarketplace:true});
}
export function reconcileInsuranceCommission({partnerEligible, statement, premiumVerified, contractRateBasisPoints}={}) {
  if (partnerEligible !== true) return Object.freeze({state:'blocked_partner_not_approved',earnedMinor:null});
  if (!statement || typeof statement.policyReference !== 'string' || !statement.policyReference.trim() || typeof statement.currency !== 'string' || statement.currency !== 'BWP') throw new TypeError('invalid_statement');
  if (!Number.isSafeInteger(statement.premiumMinor) || statement.premiumMinor < 0 || !Number.isSafeInteger(contractRateBasisPoints) || contractRateBasisPoints < 0 || contractRateBasisPoints > 10000) throw new RangeError('invalid_amount_or_rate');
  if (statement.status === 'reversed') return Object.freeze({state:'reversed',earnedMinor:0});
  if (statement.status !== 'issued' || premiumVerified !== true) return Object.freeze({state:'pending_verification',earnedMinor:null});
  const numerator = statement.premiumMinor * contractRateBasisPoints;
  if (!Number.isSafeInteger(numerator)) throw new RangeError('commission_overflow');
  return Object.freeze({state:'eligible_for_partner_reconciliation',earnedMinor:null,estimatedContractAmountMinor:Math.floor(numerator/10000)});
}
