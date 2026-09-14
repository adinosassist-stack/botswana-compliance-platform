from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1))

# Cloudflare Workers rejects PBKDF2 work factors above 100,000. The parser ceiling
# must match the derivation ceiling so stored credentials can never request an
# unsupported amount of work at login/reset time.
replace_once(
    'cloudflare/src/worker.js',
    'const PASSWORD_PBKDF2_MAX_ITERATIONS=300000;',
    'const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;',
    'Worker PBKDF2 maximum',
)

# Registration/owner release regression: reject unsupported >100k stored hashes.
p = Path('tests/v82-registration-owner-navigation-hardening.mjs')
text = p.read_text()
text = text.replace(
    "ok('production PBKDF2 work factor is Worker-compatible',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));\n",
    "ok('production PBKDF2 work factor is Worker-compatible',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));\n"
    "ok('stored PBKDF2 parser is capped to the same Workers runtime maximum',worker.includes('const PASSWORD_PBKDF2_MAX_ITERATIONS=100000;'));\n",
    1,
)
old = "const stronger='pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';\nok('current hash remains current',__v782150Test.parsePasswordHash(current)?.iterations===100000&&!__v782150Test.passwordNeedsRehash(current));\nok('stronger accepted hash is not downgraded',__v782150Test.parsePasswordHash(stronger)?.iterations===120000&&!__v782150Test.passwordNeedsRehash(stronger));"
new = "const unsupported='pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';\nok('current hash remains current',__v782150Test.parsePasswordHash(current)?.iterations===100000&&!__v782150Test.passwordNeedsRehash(current));\nok('runtime-unsupported stronger hash fails closed before PBKDF2 derivation',__v782150Test.parsePasswordHash(unsupported)===null);"
if old not in text:
    raise SystemExit('V82 stronger-hash expectation marker missing')
text = text.replace(old, new, 1)
p.write_text(text)

# Historical PBKDF2 resilience regression must encode the actual Workers runtime ceiling.
p = Path('tests/v78-12150-resilience-backup-rate-limit-adversarial.mjs')
text = p.read_text()
old = 'ok(source.includes("PASSWORD_PBKDF2_MAX_ITERATIONS=300000")&&source.includes("parsePasswordHash(stored)"),"stored password hashes must be structurally and computationally bounded");'
new = 'ok(source.includes("PASSWORD_PBKDF2_MAX_ITERATIONS=100000")&&source.includes("parsePasswordHash(stored)"),"stored password hashes must be bounded to the Cloudflare Workers PBKDF2 runtime ceiling");'
if old not in text:
    raise SystemExit('historical PBKDF2 ceiling marker missing')
text = text.replace(old, new, 1)
old = 'const stronger=__v782150Test.parsePasswordHash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=");\nok(stronger?.iterations===120000&&!__v782150Test.passwordNeedsRehash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk="),"stronger accepted PBKDF2 hashes must never be downgraded");'
new = 'const unsupported=__v782150Test.parsePasswordHash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=");\nok(unsupported===null,"PBKDF2 hashes above the Workers runtime ceiling must fail closed before derivation");'
if old not in text:
    raise SystemExit('historical stronger-hash marker missing')
text = text.replace(old, new, 1)
p.write_text(text)

# Accept the exact reviewed successor service-worker cache token introduced by this hotfix.
replace_once(
    'tests/v78-start-free-visibility-static.mjs',
    "sw.includes('1.21.101-bf07-toolchain-package-hardening-cta-runtime-hotfix-20260913')",
    "(sw.includes('1.21.101-bf07-toolchain-package-hardening-cta-runtime-hotfix-20260913')||sw.includes('1.21.101-registration-owner-ui-hotfix-20260914'))",
    'Start-free cache successor lineage',
)

# Remove all one-off audit/probe scaffolding from the release candidate.
for rel in [
    '.github/workflows/tmp-remote-crypto-probe.yml',
    'scripts/tmp-crypto-probe-wrangler.jsonc',
    'scripts/tmp-crypto-runtime-probe.mjs',
    'scripts/tmp-d1-registration-write-probe.mjs',
    'scripts/tmp-live-registration-audit.mjs',
    'scripts/tmp-live-registration-d1-audit.mjs',
    'scripts/tmp-production-registration-lifecycle.mjs',
    'scripts/tmp-registration-worker-probe.mjs',
    'scripts/tmp-finalize-registration-hotfix.py',
]:
    Path(rel).unlink(missing_ok=True)
