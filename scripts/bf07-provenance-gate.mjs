import {validateProvenance} from './bf07-provenance-core.mjs';
const p=validateProvenance(process.cwd());
console.log(`BF-07 provenance gate passed: provider=${p.provider}, commit=${p.source?.commit||'manual'}`);
