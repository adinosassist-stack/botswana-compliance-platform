import path from 'node:path';
import {validateEvidence} from './bf07-evidence-core.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const {counts,sbomComponents}=validateEvidence(root);
console.log(`BF-07 evidence gate passed: ${sbomComponents} SBOM components; npm audit high=${counts.high}, critical=${counts.critical}`);
