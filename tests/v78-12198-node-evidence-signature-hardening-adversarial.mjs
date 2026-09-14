import fs from 'fs';
const read=p=>fs.readFileSync(p,'utf8');
const server=read('server/server.js'),sig=read('server/evidence-file-signature.js'),worker=read('cloudflare/src/worker.js'),pkg=JSON.parse(read('package.json')),profile=JSON.parse(read('RELEASE_PROFILE.json')),sw=read('public/sw.js'),launch=read('docs/LAUNCH.md');
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};
ok(['1.21.98','1.21.99','1.21.100','1.21.101'].includes(pkg.version)&&profile.package_version===pkg.version&&profile.software_release_candidate===`v78.${pkg.version}`,'v1.21.98 release identity aligned');
ok(profile.v12198_node_evidence_signature_hardening===true&&profile.node_evidence_committed_magic_byte_verification===true&&profile.node_evidence_signature_read_max_bytes===4096,'release profile records Node evidence signature verification');
ok(server.includes('import { evidenceFileSignatureMatches, boundedS3Prefix } from "./evidence-file-signature.js"'),'Node evidence path imports bounded signature verifier');
ok(server.includes('Range:"bytes=0-4095"')&&server.includes('boundedS3Prefix(signatureObject.Body,4096)'),'committed evidence signature read is range-bounded to 4096 bytes');
ok(server.includes('if(!evidenceFileSignatureMatches(ev.content_type,signaturePrefix))throw new Error("committed_object_signature_mismatch")'),'MIME claim must match committed-object magic bytes');
const sigRead=server.indexOf('Range:"bytes=0-4095"'),db=server.indexOf('update evidence set object_key=$5');
ok(sigRead>0&&db>sigRead,'signature verification occurs before evidence database trust transition');
ok(sig.includes('application/pdf')&&sig.includes('image/png')&&sig.includes('image/jpeg')&&sig.includes('wordprocessingml.document'),'Node signature helper covers every Node evidence MIME allowlist type');
ok(sig.includes('evidence_signature_prefix_too_large'),'signature body reader fails closed if storage ignores the Range bound');
ok(worker.includes('function fileSignatureMatches(contentType,buf)')&&worker.includes('if(!fileSignatureMatches(ct,buf))'),'Worker evidence magic-byte verification remains intact');
ok(sw.includes('1.21.101-registration-owner-ui-hotfix-20260914'),'service-worker cache identifies v1.21.98 reviewed successor');
{const chain=String(pkg.scripts.test||'');ok(chain.indexOf('test:v78-12198')>=0&&chain.indexOf('test:v78-12198')<chain.indexOf('test:v78-12197'),'v1.21.98 remains ordered before v1.21.97 in the full regression chain');}
ok(launch.includes('range-reads at most 4096 bytes')&&launch.includes('file magic bytes'),'operator documentation records committed-object signature boundary');
console.log(`V78 1.21.98 Node evidence signature hardening adversarial: ${pass}/${pass} PASS`);
