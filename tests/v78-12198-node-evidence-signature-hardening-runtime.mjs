import {evidenceFileSignatureMatches,boundedS3Prefix} from '../server/evidence-file-signature.js';
let pass=0;const ok=(c,m)=>{if(!c)throw new Error('FAIL: '+m);pass++;console.log('PASS',m)};
ok(evidenceFileSignatureMatches('application/pdf',new Uint8Array([0x25,0x50,0x44,0x46,0x2d,1])),'PDF magic accepted');
ok(!evidenceFileSignatureMatches('application/pdf',new Uint8Array([0x4d,0x5a,0x90,0,0])),'mislabeled executable is rejected as PDF');
ok(evidenceFileSignatureMatches('image/png',new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'PNG magic accepted');
ok(!evidenceFileSignatureMatches('image/png',new Uint8Array([0xff,0xd8,0xff,0,0,0,0,0])),'JPEG bytes are rejected as PNG');
ok(evidenceFileSignatureMatches('image/jpeg',new Uint8Array([0xff,0xd8,0xff,0xe0])),'JPEG magic accepted');
ok(evidenceFileSignatureMatches('application/vnd.openxmlformats-officedocument.wordprocessingml.document',new Uint8Array([0x50,0x4b,0x03,0x04])),'DOCX ZIP magic accepted');
ok(!evidenceFileSignatureMatches('application/vnd.openxmlformats-officedocument.wordprocessingml.document',new Uint8Array([0x25,0x50,0x44,0x46])),'non-ZIP bytes are rejected as DOCX');
const small=await boundedS3Prefix({async transformToByteArray(){return new Uint8Array([1,2,3])}},4096);ok(small.length===3,'bounded S3 prefix accepts a small range body');
let over=false;try{await boundedS3Prefix({async transformToByteArray(){return new Uint8Array(4097)}},4096)}catch(e){over=/prefix_too_large/.test(String(e.message))}ok(over,'bounded S3 prefix rejects oversized transform body');
async function* stream(){yield new Uint8Array(3000);yield new Uint8Array(1500)}
over=false;try{await boundedS3Prefix(stream(),4096)}catch(e){over=/prefix_too_large/.test(String(e.message))}ok(over,'bounded S3 prefix rejects streamed overrun');
console.log(`V78 1.21.98 Node evidence signature hardening runtime: ${pass}/${pass} PASS`);
