/**
 * SOURCE-ONLY, UNMOUNTED isolated-private-staging customer consent capture candidate.
 * Verifies a pinned provider-signed, freshly reauthenticated OIDC ID token and
 * explicit acceptance of exactly the server-side frozen quote bytes/amount.
 * This is NOT an endpoint, deployed IdP integration or operational permission.
 * Host owns secure session/CSRF, challenge generation + persistence, authoritative
 * customer-account link, and atomic one-time consent commit. Never use Finance.
 */
const ID = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const HEX = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const err = () => { throw Error("private_customer_consent_unverified"); };
const MAX_BYTES = 131072;
const WINDOW_MS = 5 * 60_000;
const encoder = new TextEncoder();

function decodedBase64url(segment) {
  if (typeof segment !== "string" || !/^[A-Za-z0-9_-]+$/.test(segment)) err();
  let raw;
  try {
    raw = atob(segment.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - segment.length % 4) % 4));
  } catch { err(); }
  const value = Uint8Array.from(raw, char => char.charCodeAt(0));
  // Reject noncanonical encodings and malformed UTF-8 JSON.
  if (base64url(value) !== segment) err();
  return value;
}
function base64url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function parsedJson(bytes) {
  try {
    const item = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!item || typeof item !== "object" || Array.isArray(item)) err();
    return item;
  } catch { err(); }
}
function freezeBytes(value) {
  if (!(value instanceof Uint8Array) ||
      value.byteLength < 1 || value.byteLength > MAX_BYTES) err();
  return new Uint8Array(value);
}
async function sha256(subtle, bytes) {
  let digest;
  try { digest = new Uint8Array(await subtle.digest("SHA-256", bytes)); }
  catch { err(); }
  if (digest.length !== 32) err();
  return [...digest].map(n => n.toString(16).padStart(2, "0")).join("");
}
function safeClock(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) err();
  return value;
}

export function createEssentialsPrivateCustomerConsentCapture({
  enabled = false, environment, issuer, audience, keyId, publicKey,
  cryptoSubtle = globalThis.crypto?.subtle, now = () => Date.now(),
  verifyHostRequest, loadOneTimeChallenge, loadFrozenQuotation,
  resolveCustomerAccountLink, commitVerifiedConsent
} = {}) {
  if (enabled !== true || environment !== "essentials-private-staging")
    throw Error("private_customer_consent_disabled");
  if (typeof issuer !== "string" || !/^https:\/\/[^/\s?#]+(?:\/[^?#\s]*)?$/.test(issuer) ||
      typeof audience !== "string" || audience.length < 1 || audience.length > 200 ||
      !/^[A-Za-z0-9_.:-]{1,100}$/.test(keyId) ||
      publicKey?.type !== "public" ||
      publicKey.algorithm?.name !== "RSASSA-PKCS1-v1_5" ||
      publicKey.algorithm?.hash?.name !== "SHA-256" ||
      publicKey.algorithm?.modulusLength < 2048 ||
      !publicKey.usages?.includes("verify") ||
      typeof cryptoSubtle?.verify !== "function" ||
      typeof cryptoSubtle?.digest !== "function" || typeof now !== "function" ||
      [verifyHostRequest, loadOneTimeChallenge, loadFrozenQuotation,
        resolveCustomerAccountLink, commitVerifiedConsent]
        .some(fn => typeof fn !== "function"))
    throw Error("private_customer_consent_unconfigured");

  async function verifiedIdToken(idToken, challenge, at) {
    if (typeof idToken !== "string" || idToken.length > 8192) err();
    const parts = idToken.split(".");
    if (parts.length !== 3) err();
    const header = parsedJson(decodedBase64url(parts[0]));
    if (Object.keys(header).length !== 3 || header.alg !== "RS256" ||
        header.typ !== "JWT" || header.kid !== keyId) err();
    const claims = parsedJson(decodedBase64url(parts[1]));
    const signature = decodedBase64url(parts[2]);
    if (signature.byteLength < 256) err();
    let signatureValid = false;
    try {
      signatureValid = await cryptoSubtle.verify("RSASSA-PKCS1-v1_5",
        publicKey, signature, encoder.encode(parts[0] + "." + parts[1]));
    } catch { err(); }
    if (signatureValid !== true) err();
    const nowSeconds = Math.floor(at / 1000);
    const challengeStartSeconds = Math.floor(challenge.issuedAtMs / 1000);
    if (claims.iss !== issuer || claims.aud !== audience ||
        typeof claims.sub !== "string" || claims.sub.length < 1 ||
        claims.sub.length > 160 || !/^[A-Za-z0-9._:@|-]+$/.test(claims.sub) ||
        claims.nonce !== challenge.nonce ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.auth_time) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds ||
        claims.auth_time > nowSeconds + 60 ||
        claims.iat < challengeStartSeconds - 60 ||
        claims.auth_time < challengeStartSeconds - 60 ||
        nowSeconds - claims.iat > 300 ||
        nowSeconds - claims.auth_time > 300 ||
        (claims.nbf !== undefined &&
          (!Number.isSafeInteger(claims.nbf) || claims.nbf > nowSeconds + 60)))
      err();
    return claims;
  }

  return Object.freeze({
    async capture({
      challengeId, idToken, decision, confirmedQuoteSha256,
      confirmedTotalMinor, confirmedAcceptanceVersion
    } = {}) {
      if (!ID(challengeId) || decision !== "accept" ||
          !HEX(confirmedQuoteSha256) ||
          !Number.isSafeInteger(confirmedTotalMinor) || confirmedTotalMinor < 0 ||
          !Number.isSafeInteger(confirmedAcceptanceVersion) ||
          confirmedAcceptanceVersion < 1) err();
      // Only the trusted host can verify session, origin, CSRF, user intent and
      // a server-side binding between that session and the challenge.
      let hostOK = false;
      try {
        hostOK = await verifyHostRequest({
          challengeId, method: "POST", operation: "accept-frozen-quotation"
        });
      } catch { err(); }
      if (hostOK !== true) err();

      let challenge;
      try { challenge = await loadOneTimeChallenge({ challengeId }); }
      catch { err(); }
      const at = safeClock(now);
      if (!challenge || challenge.challengeId !== challengeId ||
          !ID(challenge.tenantId) || !ID(challenge.quotationId) ||
          !ID(challenge.customerId) || !ID(challenge.actorUserId) ||
          !ID(challenge.quotationReference) ||
          !HEX(challenge.quotationSha256) ||
          !Number.isSafeInteger(challenge.acceptanceVersion) ||
          challenge.acceptanceVersion < 1 ||
          !Number.isSafeInteger(challenge.totalMinor) || challenge.totalMinor < 0 ||
          typeof challenge.nonce !== "string" ||
          !/^[A-Za-z0-9_-]{32,128}$/.test(challenge.nonce) ||
          challenge.state !== "pending" ||
          !Number.isSafeInteger(challenge.issuedAtMs) ||
          !Number.isSafeInteger(challenge.expiresAtMs) ||
          challenge.issuedAtMs > at || challenge.expiresAtMs <= at ||
          challenge.expiresAtMs <= challenge.issuedAtMs ||
          challenge.expiresAtMs - challenge.issuedAtMs > WINDOW_MS ||
          challenge.quotationSha256 !== confirmedQuoteSha256 ||
          challenge.totalMinor !== confirmedTotalMinor ||
          challenge.acceptanceVersion !== confirmedAcceptanceVersion) err();

      const identity = await verifiedIdToken(idToken, challenge, at);
      let account;
      try {
        account = await resolveCustomerAccountLink({
          issuer, subject: identity.sub, tenantId: challenge.tenantId,
          customerId: challenge.customerId, quotationId: challenge.quotationId
        });
      } catch { err(); }
      if (!account || account.linked !== true || !ID(account.consentSubjectId) ||
          !ID(account.customerIdentityLinkId) ||
          !HEX(account.identitySubjectHmacSha256))
        err();

      let quote;
      try {
        quote = await loadFrozenQuotation({
          tenantId: challenge.tenantId, quotationId: challenge.quotationId,
          actorUserId: challenge.actorUserId
        });
      } catch { err(); }
      if (!quote || quote.state !== "accepted" ||
          quote.tenantId !== challenge.tenantId ||
          quote.quotationId !== challenge.quotationId ||
          quote.customerId !== challenge.customerId ||
          quote.quotationReference !== challenge.quotationReference ||
          quote.acceptanceVersion !== challenge.acceptanceVersion ||
          quote.totalMinor !== challenge.totalMinor) err();
      const quotationBytes = freezeBytes(quote.immutableQuotationBytes);
      const quotationSha256 = await sha256(cryptoSubtle, quotationBytes);
      if (quotationSha256 !== challenge.quotationSha256) err();

      // Consent evidence comes from server-verifiable facts. Never persist the
      // raw ID token, browser-supplied customer IDs or the cleartext nonce.
      const subjectHash = await sha256(cryptoSubtle,
        encoder.encode(issuer + "\u0000" + identity.sub));
      const nonceHash = await sha256(cryptoSubtle, encoder.encode(challenge.nonce));
      const acceptedAt = new Date(at).toISOString().replace(/\.000Z$/, "Z");
      const evidence = Object.freeze({
        method: "oidc-rs256-explicit-accept-v1",
        tenantId: challenge.tenantId,
        quotationId: challenge.quotationId,
        customerId: challenge.customerId,
        actorUserId: challenge.actorUserId,
        quotationReference: challenge.quotationReference,
        acceptanceVersion: challenge.acceptanceVersion,
        totalMinor: challenge.totalMinor,
        quotationSha256,
        challengeId, challengeNonceSha256: nonceHash,
        identityIssuer: issuer, identitySubjectSha256: subjectHash,
        consentSubjectId: account.consentSubjectId,
        customerIdentityLinkId: account.customerIdentityLinkId,
        identitySubjectHmacSha256: account.identitySubjectHmacSha256,
        reauthenticatedAt: new Date(identity.auth_time * 1000).toISOString()
          .replace(/\.000Z$/, "Z"),
        acceptedAt, decision: "accept"
      });
      const immutableConsentBytes = encoder.encode(JSON.stringify(evidence));
      const consentSha256 = await sha256(cryptoSubtle, immutableConsentBytes);
      // The host MUST atomically check CURRENT challenge nonce/expiry/unused
      // state and frozen quotation, insert exact immutable evidence, and consume
      // the challenge in ONE transaction. A boolean mock is not assurance.
      let committed = false;
      try {
        committed = await commitVerifiedConsent({
          challengeId, tenantId: challenge.tenantId,
          quotationId: challenge.quotationId, actorUserId: challenge.actorUserId,
          customerId: challenge.customerId,
          consentSubjectId: account.consentSubjectId,
          acceptanceVersion: challenge.acceptanceVersion,
          quotationReference: challenge.quotationReference,
          totalMinor: challenge.totalMinor, quotationSha256,
          immutableConsentBytes, consentSha256, acceptedAt
        });
      } catch { err(); }
      if (committed !== true) err();
      return Object.freeze({
        state: "captured", tenantId: challenge.tenantId,
        quotationId: challenge.quotationId, consentSha256
      });
    }
  });
}
