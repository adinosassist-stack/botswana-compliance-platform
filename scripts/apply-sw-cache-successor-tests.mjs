import fs from 'node:fs';
import path from 'node:path';
const root='tests';
const old='101-bf07-toolchain-package-hardening)/';
const replacement='101-bf07-toolchain-package-hardening|101-registration-owner-ui-hotfix-20260914)/';
let changed=[];
for(const name of fs.readdirSync(root)){
  if(!name.endsWith('.mjs'))continue;
  const p=path.join(root,name),s=fs.readFileSync(p,'utf8');
  if(!s.includes(old))continue;
  const next=s.split(old).join(replacement);
  fs.writeFileSync(p,next);
  changed.push(p);
}
if(!changed.length)throw new Error('no stale service-worker cache assertions found');
console.log(`updated ${changed.length} stale cache assertions`);
for(const p of changed)console.log(p);
