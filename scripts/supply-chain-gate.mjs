import fs from 'node:fs';
import path from 'node:path';
import {validateLockAndBuildSbom} from './supply-chain-core.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const {lock,components,serialized}=validateLockAndBuildSbom(root);
fs.writeFileSync(path.join(root,'sbom.cdx.json'),serialized);
console.log(`Supply-chain gate passed: lockfile v${lock.lockfileVersion}, ${components.length} unique registry-locked components, deterministic CycloneDX 1.5 SBOM refreshed`);
