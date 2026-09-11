import fs from 'node:fs';
import path from 'node:path';
import {buildProvenance} from './bf07-provenance-core.mjs';
const root=process.cwd(),out=path.join(root,'bf07-provenance.json');
fs.writeFileSync(out,JSON.stringify(buildProvenance(root),null,2)+'\n');
console.log(`BF-07 provenance written: ${out}`);
