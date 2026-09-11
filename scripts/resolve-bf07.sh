#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"
REGISTRY='https://registry.npmjs.org/'
VERIFY_DIR="$ROOT_DIR/dist/bf07-verification"
CACHE_DIR=''
VERIFY_CACHE_DIR=''
EXTRACT_DIR=''
VERIFY_ARCHIVE_COPY=''
SUCCESS=0

info(){ printf '[INFO] %s\n' "$*"; }
pass(){ printf '[PASS] %s\n' "$*"; }
fail(){ printf '[FAIL] %s\n' "$*" >&2; exit 1; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }
hash_file(){ node -e "const fs=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$1"; }

PKG_VERSION="$(node -p "require('./package.json').version")"
PKG_CODE="${PKG_VERSION//./}"
SEALED_ZIP="$ROOT_DIR/dist/THEBE_DESK_V81_RECOVERY_R1_${PKG_CODE}_RELEASE_SEALED.zip"
SEALED_SHA="$SEALED_ZIP.sha256"

cleanup(){
  local rc=$?
  trap - EXIT
  [[ -n "$CACHE_DIR" ]] && rm -rf "$CACHE_DIR" || true
  [[ -n "$VERIFY_CACHE_DIR" ]] && rm -rf "$VERIFY_CACHE_DIR" || true
  [[ -n "$EXTRACT_DIR" ]] && rm -rf "$EXTRACT_DIR" || true
  [[ -n "$VERIFY_ARCHIVE_COPY" ]] && rm -f "$VERIFY_ARCHIVE_COPY" || true
  if [[ "$SUCCESS" -ne 1 ]]; then
    rm -f "$SEALED_ZIP" "$SEALED_SHA" package-lock.json sbom.cdx.json audit-report.json audit-report.json.tmp bf07-evidence.json bf07-provenance.json
    rm -rf node_modules "$VERIFY_DIR"
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

info '1/10 Verify exact toolchain and immutable resolver policy'
for cmd in node npm zip unzip zipinfo cp; do require_cmd "$cmd"; done
EXPECTED_NODE="$(tr -d '[:space:]v' < .nvmrc)"
ACTUAL_NODE="$(node -p 'process.versions.node')"
[[ "$ACTUAL_NODE" == "$EXPECTED_NODE" ]] || fail "Active Node $ACTUAL_NODE does not match .nvmrc $EXPECTED_NODE"
EXPECTED_NPM="$(node -p "String(require('./package.json').packageManager||'').replace(/^npm@/,'')")"
ACTUAL_NPM="$(npm --version)"
[[ -n "$EXPECTED_NPM" && "$ACTUAL_NPM" == "$EXPECTED_NPM" ]] || fail "Active npm $ACTUAL_NPM does not match packageManager npm@$EXPECTED_NPM"
[[ "$(npm config get offline)" == 'false' ]] || fail 'npm offline mode must be false'
[[ "$(npm config get prefer-offline)" != 'true' ]] || fail 'npm prefer-offline must not be true'
pass "Pinned Node $ACTUAL_NODE / npm $ACTUAL_NPM verified"

info '2/10 Create isolated empty npm cache and prove live registry reachability'
CACHE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bf07-npm-cache.XXXXXX")"
[[ -z "$(find "$CACHE_DIR" -mindepth 1 -print -quit)" ]] || fail 'Fresh npm cache directory is unexpectedly non-empty'
export NPM_CONFIG_CACHE="$CACHE_DIR"
export NPM_CONFIG_REGISTRY="$REGISTRY"
export NPM_CONFIG_OFFLINE=false
export NPM_CONFIG_PREFER_OFFLINE=false
export NPM_CONFIG_PREFER_ONLINE=true
export NPM_CONFIG_FUND=false
npm ping --registry="$REGISTRY" >/dev/null
pass 'Canonical npm registry responded using an isolated initially-empty cache'

info '3/10 Remove stale dependency/evidence state'
rm -rf node_modules
rm -f package-lock.json sbom.cdx.json audit-report.json audit-report.json.tmp bf07-evidence.json bf07-provenance.json
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
find "$ROOT_DIR/dist" -maxdepth 1 -type f \( -name '*_RELEASE_SEALED.zip' -o -name '*_RELEASE_SEALED.zip.sha256' \) -delete
pass 'Pre-existing lock, install tree, SBOM, audit, BF-07 evidence and provenance removed'

info '4/10 Resolve a fresh registry-backed lockfile and verify install reconstruction'
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online --registry="$REGISTRY"
[[ -s package-lock.json ]] || fail 'package-lock.json was not generated'
LOCK_SHA="$(hash_file package-lock.json)"
npm ci --ignore-scripts --no-audit --no-fund --prefer-online --registry="$REGISTRY"
[[ "$(hash_file package-lock.json)" == "$LOCK_SHA" ]] || fail 'npm ci mutated package-lock.json'
npm ls --all --json >/dev/null
pass "Fresh package-lock generated and npm ci reconstructed it exactly (sha256=$LOCK_SHA)"

info '5/10 Generate deterministic CycloneDX SBOM twice'
npm run check:supply-chain
[[ -s sbom.cdx.json ]] || fail 'Supply-chain gate did not generate sbom.cdx.json'
SBOM_A="$(hash_file sbom.cdx.json)"
npm run check:supply-chain >/dev/null
SBOM_B="$(hash_file sbom.cdx.json)"
[[ "$SBOM_A" == "$SBOM_B" ]] || fail 'Deterministic SBOM changed across identical runs'
[[ "$(hash_file package-lock.json)" == "$LOCK_SHA" ]] || fail 'Supply-chain gate mutated package-lock.json'
pass "CycloneDX SBOM is byte-stable across repeated generation (sha256=$SBOM_A)"

info '6/10 Generate production-only high-severity npm audit evidence'
set +e
npm audit --omit=dev --audit-level=high --json > audit-report.json.tmp
AUDIT_RC=$?
set -e
mv audit-report.json.tmp audit-report.json
node - <<'NODE'
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('audit-report.json','utf8'));
if(r.error) throw new Error(`npm audit error: ${r.error.summary||r.error.code||'unknown'}`);
const v=r.metadata?.vulnerabilities;if(!v)throw new Error('npm audit report missing vulnerability metadata');
if(Number(v.high||0)!==0||Number(v.critical||0)!==0)throw new Error(`high/critical vulnerabilities remain: high=${v.high||0}, critical=${v.critical||0}`);
console.log(`npm audit policy passed: high=${v.high||0}, critical=${v.critical||0}, total=${v.total||0}`);
NODE
[[ "$AUDIT_RC" -eq 0 ]] || fail "npm audit --omit=dev --audit-level=high failed with exit $AUDIT_RC"
[[ "$(hash_file package-lock.json)" == "$LOCK_SHA" ]] || fail 'npm audit mutated package-lock.json'
pass 'Production dependency audit report saved and high/critical policy passed'

info '7/10 Bind dependency evidence, policy source, and execution provenance'
BF07_NPM_VERSION="$ACTUAL_NPM" BF07_REGISTRY_LIVE=1 BF07_CLEAN_CACHE=1 BF07_NPM_CI_VERIFIED=1 node scripts/write-bf07-evidence.mjs
npm run check:bf07-evidence
node scripts/write-bf07-provenance.mjs
npm run check:bf07-provenance
pass 'Evidence manifest binds lock/SBOM/audit plus BF-07 policy source; provenance binds the resolver execution context'

info '8/10 Run complete release check against bound evidence and provenance'
npm run release:check
[[ "$(hash_file package-lock.json)" == "$LOCK_SHA" ]] || fail 'release:check mutated package-lock.json'
npm run check:bf07-evidence >/dev/null
npm run check:bf07-provenance >/dev/null
pass 'Full regression, artifact, supply-chain, audit, provenance, launch and preflight release checks passed'

info '9/10 Create release-sealed deterministic archive'
npm run release:package
[[ -s "$SEALED_ZIP" && -s "$SEALED_SHA" ]] || fail 'Release-sealed archive or checksum was not created'
EXPECTED_ZIP_SHA="$(awk '{print $1}' "$SEALED_SHA")"
[[ "$EXPECTED_ZIP_SHA" == "$(hash_file "$SEALED_ZIP")" ]] || fail 'Release SHA-256 sidecar mismatch'
EXPECTED_SIDECAR_SHA="$(hash_file "$SEALED_SHA")"
pass "Sealed archive created (sha256=$EXPECTED_ZIP_SHA)"

info '10/10 Independently clean-extract and reverify exact sealed artifact'
VERIFY_ARCHIVE_COPY="$(mktemp "${TMPDIR:-/tmp}/bf07-verified-archive.XXXXXX")"
cp "$SEALED_ZIP" "$VERIFY_ARCHIVE_COPY"
[[ "$(hash_file "$VERIFY_ARCHIVE_COPY")" == "$EXPECTED_ZIP_SHA" ]] || fail 'Verification snapshot does not match sealed archive hash captured before independent verification'
[[ "$(hash_file "$SEALED_SHA")" == "$EXPECTED_SIDECAR_SHA" ]] || fail 'Release sidecar changed before independent verification'
ARCHIVE_LIST="$(unzip -Z1 "$VERIFY_ARCHIVE_COPY")"
for required in package-lock.json sbom.cdx.json audit-report.json bf07-evidence.json bf07-provenance.json .nvmrc scripts/resolve-bf07.sh scripts/bf07-evidence-gate.mjs scripts/bf07-provenance-gate.mjs scripts/bf07-release-provenance-core.mjs scripts/write-bf07-release-provenance.mjs scripts/bf07-release-provenance-gate.mjs .github/workflows/bf07-seal.yml; do
  grep -Fxq "$required" <<<"$ARCHIVE_LIST" || fail "Sealed archive is missing $required"
done
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  case "$entry" in /*|../*|*/../*|*/..|..) fail "Archive path traversal entry: $entry";; esac
  lower="$(printf '%s' "$entry" | tr '[:upper:]' '[:lower:]')"; base="${lower##*/}"
  if [[ "$base" == '.env' || ( "$base" == .env.* && "$base" != '.env.example' ) || "$base" == '.dev.vars' || "$base" == '.npmrc.local' ]]; then fail "Forbidden environment file in archive: $entry"; fi
  case "$lower" in *.pem|*.key|*.p12|*.pfx|*.sqlite|*.sqlite3|*.db) fail "Forbidden key/database payload in archive: $entry";; esac
done <<<"$ARCHIVE_LIST"
if zipinfo -l "$VERIFY_ARCHIVE_COPY" | awk '$1 ~ /^l/ {found=1} END{exit(found?0:1)}'; then fail 'Sealed archive contains a symbolic link'; fi
EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bf07-sealed.XXXXXX")"
unzip -q "$VERIFY_ARCHIVE_COPY" -d "$EXTRACT_DIR"
for required in package-lock.json sbom.cdx.json audit-report.json bf07-evidence.json bf07-provenance.json; do
  [[ "$(hash_file "$ROOT_DIR/$required")" == "$(hash_file "$EXTRACT_DIR/$required")" ]] || fail "Packaged $required differs from source evidence"
done
VERIFY_CACHE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bf07-verify-cache.XXXXXX")"
[[ -z "$(find "$VERIFY_CACHE_DIR" -mindepth 1 -print -quit)" ]] || fail 'Independent verification cache is unexpectedly non-empty'
(
  cd "$EXTRACT_DIR"
  export NPM_CONFIG_CACHE="$VERIFY_CACHE_DIR" NPM_CONFIG_REGISTRY="$REGISTRY" NPM_CONFIG_OFFLINE=false NPM_CONFIG_PREFER_OFFLINE=false NPM_CONFIG_PREFER_ONLINE=true NPM_CONFIG_FUND=false
  info '10/10 verify: canonical npm registry reachability'
  npm ping --registry="$REGISTRY"
  info '10/10 verify: clean npm ci reconstruction'
  npm ci --ignore-scripts --no-audit --no-fund --prefer-online --registry="$REGISTRY"
  info '10/10 verify: complete test suite'
  npm test
  info '10/10 verify: artifact boundary'
  npm run check:artifact-boundary
  info '10/10 verify: supply-chain and deterministic SBOM'
  npm run check:supply-chain
  info '10/10 verify: BF-07 evidence binding'
  npm run check:bf07-evidence
  info '10/10 verify: BF-07 execution provenance'
  npm run check:bf07-provenance
  info '10/10 verify: production dependency audit'
  npm audit --omit=dev --audit-level=high
  info '10/10 verify: launch gate'
  npm run launch:gate
)
[[ "$(hash_file "$VERIFY_ARCHIVE_COPY")" == "$EXPECTED_ZIP_SHA" ]] || fail 'Verification snapshot changed during independent verification'
BF07_VERIFIED_ARCHIVE_SHA256="$EXPECTED_ZIP_SHA" BF07_VERIFIED_SIDECAR_SHA256="$EXPECTED_SIDECAR_SHA" node scripts/write-bf07-release-provenance.mjs
BF07_VERIFIED_ARCHIVE_SHA256="$EXPECTED_ZIP_SHA" BF07_VERIFIED_SIDECAR_SHA256="$EXPECTED_SIDECAR_SHA" node scripts/bf07-release-provenance-gate.mjs
[[ "$(hash_file "$SEALED_ZIP")" == "$EXPECTED_ZIP_SHA" ]] || fail 'Sealed archive changed after independent verification'
[[ "$(hash_file "$SEALED_SHA")" == "$EXPECTED_SIDECAR_SHA" ]] || fail 'Release sidecar changed after independent verification'
pass 'Exact sealed archive independently registry-installed from a second empty cache, fully regression-tested, audited, and exact-archive provenance validated against a hash-checked verification snapshot and pre-verification hashes'

SUCCESS=1
trap - EXIT
rm -rf "$CACHE_DIR" "$VERIFY_CACHE_DIR" "$EXTRACT_DIR"; CACHE_DIR=''; VERIFY_CACHE_DIR=''; EXTRACT_DIR=''
rm -f "$VERIFY_ARCHIVE_COPY"; VERIFY_ARCHIVE_COPY=''
pass 'BF-07 CLOSED: registry-resolved lock, deterministic SBOM, audit, policy-bound evidence, run-bound provenance, independently verified archive, and validated release provenance all verified'
printf 'Sealed artifact: %s\n' "$SEALED_ZIP"
printf 'SHA-256 sidecar: %s\n' "$SEALED_SHA"
printf 'Release provenance: %s\n' "$VERIFY_DIR/release-provenance.json"
