import path from 'node:path';
import {validateReleaseProvenance} from './bf07-release-provenance-core.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const release=validateReleaseProvenance(root);
console.log(`BF-07 exact-archive release provenance verified: ${release.sealedArchiveSha256}`);
