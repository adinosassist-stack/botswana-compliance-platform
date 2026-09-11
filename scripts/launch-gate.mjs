import fs from 'node:fs';
import path from 'node:path';
import {validateEvidence} from './bf07-evidence-core.mjs';
import {validateProvenance} from './bf07-provenance-core.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const requiredFiles=['package-lock.json','sbom.cdx.json','audit-report.json','bf07-evidence.json','bf07-provenance.json','.nvmrc','.npmrc','scripts/supply-chain-core.mjs','scripts/bf07-evidence-core.mjs','scripts/bf07-evidence-gate.mjs','scripts/bf07-provenance-core.mjs','scripts/bf07-provenance-gate.mjs','scripts/write-bf07-provenance.mjs','scripts/resolve-bf07.sh','.github/workflows/bf07-seal.yml','scripts/artifact-boundary-gate.mjs','scripts/package-release.mjs','docs/LAUNCH.md','docs/SECURITY.md','docs/INCIDENT_RESPONSE.md','docs/BACKUP_RESTORE.md','docs/MALWARE_SCANNING.md','docs/SUBSCRIPTIONS.md','.env.example','Dockerfile','docker-compose.yml','tests/recovery-v81-sites-adversarial.mjs','docs/recovery/V81_RECOVERY_LINEAGE.md','docs/recovery/V81_SITES_FINAL_HTML_REVIEW.html'];
for(const f of requiredFiles)if(!fs.existsSync(path.join(root,f)))throw new Error('Launch artifact missing: '+f);
validateEvidence(root);
validateProvenance(root);
const server=fs.readFileSync(path.join(root,'server/server.js'),'utf8');
const httpEnvelope=fs.readFileSync(path.join(root,'server/http-envelope.js'),'utf8');
for(const x of ['MALWARE_SCAN_REQUIRED','scan_status!=="clean"','requireEntitlement','workspace_conflict','/api/ready','/api/ops/diagnostics','createHardenedHttpServer','RETENTION_JOB_SECRET','TURNSTILE_SECRET_KEY','MALWARE_SCAN_REQUIRED must be true in production','verifyEvidenceObjectHead','CopyObjectCommand','sha256_required_for_scan_verdict','EVIDENCE_STAGING_DELETE_FAILED','evidence_deleted'])if(!server.includes(x))throw new Error('Launch control missing: '+x);
for(const x of ['http.createServer({maxHeaderSize:HTTP_MAX_HEADER_SIZE},guardedRequestHandler)','HTTP_MAX_HEADER_SIZE=16*1024','HTTP_MAX_HEADERS_COUNT=100','server.maxHeadersCount=0','server.on("checkContinue"','rawHeaderCountExceeded','too_many_headers','server.on("checkExpectation"','pathname.startsWith("/api/")||pathname.startsWith("/public/")'])if(!httpEnvelope.includes(x))throw new Error('HTTP envelope launch control missing: '+x);
const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
if(!docker.includes('node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32')||!docker.includes('npm ci --omit=dev --ignore-scripts --no-audit --no-fund')||docker.includes('npm install'))throw new Error('Reproducible Docker release boundary missing');
const wrangler=fs.readFileSync(path.join(root,'cloudflare/wrangler.toml'),'utf8');
if(!/^workers_dev\s*=\s*false$/m.test(wrangler)||!/^preview_urls\s*=\s*false$/m.test(wrangler))throw new Error('Production Worker alternate public origins must be disabled');
console.log('Launch artifact gate passed with BF-07 lock/SBOM/audit evidence and resolver provenance cryptographically bound');
