import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createEssentialsPrivateCustomerConsentCapture } from
  "../server/essentials-private-customer-consent-capture.mjs";

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const keys = await subtle.generateKey({
  name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
}, false, ["sign", "verify"]);
const NOW = Date.parse("2026-11-19T13:00:00Z");
const ISSUER = "https://identity.example.test";
const AUDIENCE = "thebe-essentials-private-consent";
const KID = "private-idp-key-A";
const digest = async b => [...new Uint8Array(await subtle.digest("SHA-256", b))]
  .map(n => n.toString(16).padStart(2, "0")).join("");
const frozen = encoder.encode("SYNTHETIC FROZEN tenantA quoteA v2 BWP100.00");
const frozenHash = await digest(frozen);
const challenge = {
  challengeId: "challengeA", tenantId: "tenantA", quotationId: "quoteA",
  customerId: "customerA", actorUserId: "actorA",
  quotationReference: "Q-101", acceptanceVersion: 2, totalMinor: 10000,
  quotationSha256: frozenHash, nonce: "N".repeat(48), state: "pending",
  issuedAtMs: NOW - 30_000, expiresAtMs: NOW + 120_000
};
const quote = {
  state: "accepted", tenantId: "tenantA", quotationId: "quoteA",
  customerId: "customerA", quotationReference: "Q-101",
  acceptanceVersion: 2, totalMinor: 10000,
  immutableQuotationBytes: frozen
};
const claims = {
  iss: ISSUER, aud: AUDIENCE, sub: "customer-subject-A",
  nonce: challenge.nonce, auth_time: Math.floor(NOW / 1000) - 20,
  iat: Math.floor(NOW / 1000) - 20, exp: Math.floor(NOW / 1000) + 240
};
const b64 = value => Buffer.from(value).toString("base64url");
async function token(overrides = {}, header = {}) {
  const first = b64(JSON.stringify({
    alg: "RS256", typ: "JWT", kid: KID, ...header
  }));
  const second = b64(JSON.stringify({ ...claims, ...overrides }));
  const signed = first + "." + second;
  const sig = await subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey,
    encoder.encode(signed));
  return signed + "." + b64(new Uint8Array(sig));
}
function harness(options = {}) {
  let pending = true;
  const committed = [];
  const service = createEssentialsPrivateCustomerConsentCapture({
    enabled: true, environment: "essentials-private-staging",
    issuer: ISSUER, audience: AUDIENCE, keyId: KID, publicKey: keys.publicKey,
    cryptoSubtle: subtle, now: () => options.now ?? NOW,
    verifyHostRequest: async input => {
      assert.deepEqual(input, { challengeId: "challengeA",
        method: "POST", operation: "accept-frozen-quotation" });
      return options.hostOK ?? true;
    },
    loadOneTimeChallenge: async () => pending
      ? { ...challenge, ...(options.challenge ?? {}) } : null,
    loadFrozenQuotation: async () =>
      ({ ...quote, ...(options.quote ?? {}) }),
    resolveCustomerAccountLink: async input => {
      assert.equal(input.subject, options.subject ?? "customer-subject-A");
      return options.link ?? { linked: true, consentSubjectId: "customerAuthA",
        customerIdentityLinkId: "linkA", identitySubjectHmacSha256: "c".repeat(64) };
    },
    commitVerifiedConsent: async record => {
      committed.push(record);
      if (options.commit === false) return false;
      if (!pending) return false;
      pending = false; return true;
    }
  });
  return { service, committed };
}
const accept = (idToken, overrides = {}) => ({
  challengeId: "challengeA", idToken, decision: "accept",
  confirmedQuoteSha256: frozenHash, confirmedTotalMinor: 10000,
  confirmedAcceptanceVersion: 2, ...overrides
});

test("disabled unless a pinned private-staging OIDC verifier and host are configured", () => {
  assert.throws(() => createEssentialsPrivateCustomerConsentCapture(),
    /private_customer_consent_disabled/);
  assert.throws(() => createEssentialsPrivateCustomerConsentCapture({
    enabled: true, environment: "essentials-private-staging"
  }), /private_customer_consent_unconfigured/);
  assert.throws(() => createEssentialsPrivateCustomerConsentCapture({
    enabled: true, environment: "production"
  }), /private_customer_consent_disabled/);
});

test("accepts signed fresh IdP reauthentication and exact frozen quote only once", async () => {
  const h = harness();
  const input = accept(await token());
  const result = await h.service.capture(input);
  assert.equal(result.state, "captured");
  assert.equal(result.tenantId, "tenantA");
  assert.equal(h.committed.length, 1);
  const saved = h.committed[0];
  assert.equal(saved.consentSha256,
    await digest(saved.immutableConsentBytes));
  const consent = JSON.parse(new TextDecoder().decode(saved.immutableConsentBytes));
  assert.equal(consent.identityIssuer, ISSUER);
  assert.equal(consent.quotationSha256, frozenHash);
  assert.equal(consent.consentSubjectId, "customerAuthA");
  assert.equal(consent.decision, "accept");
  assert.equal(consent.identitySubjectSha256,
    await digest(encoder.encode(ISSUER + "\u0000" + claims.sub)));
  assert.equal("idToken" in consent, false);
  assert.equal("nonce" in consent, false);
  await assert.rejects(h.service.capture(input), /private_customer_consent_unverified/);
  assert.equal(h.committed.length, 1);
});

test("decline, incomplete explicit confirmation, wrong displayed amount/hash/version and host CSRF denial fail closed", async () => {
  const proof = await token();
  for (const change of [
    { decision: "decline" }, { decision: true }, { confirmedQuoteSha256: null },
    { confirmedQuoteSha256: "0".repeat(64) },
    { confirmedTotalMinor: 10001 }, { confirmedAcceptanceVersion: 3 },
    { challengeId: "bad/id" }
  ]) {
    const h = harness();
    await assert.rejects(h.service.capture(accept(proof, change)),
      /private_customer_consent_unverified/);
    assert.equal(h.committed.length, 0);
  }
  const h = harness({ hostOK: false });
  await assert.rejects(h.service.capture(accept(proof)),
    /private_customer_consent_unverified/);
  assert.equal(h.committed.length, 0);
});

test("bad JWT signature, issuer, audience, nonce, stale authentication and unsafe JOSE metadata fail closed", async () => {
  const adversarial = [
    await token({ iss: "https://attacker.example.test" }),
    await token({ aud: "wrong-client" }),
    await token({ nonce: "X".repeat(48) }),
    await token({ auth_time: Math.floor(NOW / 1000) - 1000 }),
    await token({ iat: Math.floor(NOW / 1000) - 1000 }),
    await token({ exp: Math.floor(NOW / 1000) - 1 }),
    await token({}, { alg: "HS256" }),
    await token({}, { kid: "untrusted-kid" }),
    await token({}, { jku: "https://attacker.example.test/jwks" }),
    await token({}, { typ: "not-JWT" })
  ];
  const good = await token();
  const parts = good.split(".");
  adversarial.push(parts[0] + "." + parts[1].slice(0, -2) + "AA." + parts[2]);
  adversarial.push("x".repeat(9000));
  for (const jwt of adversarial) {
    const h = harness();
    await assert.rejects(h.service.capture(accept(jwt)),
      /private_customer_consent_unverified/);
    assert.equal(h.committed.length, 0);
  }
});

test("expired/changed challenge, revoked or altered quote, unlinked customer, failed atomic commit cannot capture consent", async () => {
  const proof = await token();
  for (const opts of [
    { challenge: { state: "revoked" } },
    { challenge: { nonce: "X".repeat(48) } },
    { challenge: { expiresAtMs: NOW } },
    { challenge: { customerId: "otherCustomer" } },
    { challenge: { totalMinor: 10001 } },
    { challenge: { quotationSha256: "f".repeat(64) } },
    { quote: { state: "revoked" } },
    { quote: { customerId: "otherCustomer" } },
    { quote: { totalMinor: 10001 } },
    { quote: { immutableQuotationBytes: encoder.encode("tampered") } },
    { link: { linked: false, consentSubjectId: "customerAuthA" } },
    { link: { linked: true, consentSubjectId: "../malformed" } },
    { commit: false }
  ]) {
    const h = harness(opts);
    await assert.rejects(h.service.capture(accept(proof)),
      /private_customer_consent_unverified/);
    if (opts.commit !== false) assert.equal(h.committed.length, 0);
  }
});
