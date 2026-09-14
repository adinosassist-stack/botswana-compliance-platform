import fs from 'node:fs';
import path from 'node:path';

const roots=['tests','scripts'];
const successor='101-registration-owner-ui-hotfix-20260914';
let changed=[];
for(const root of roots){
  if(!fs.existsSync(root))continue;
  for(const name of fs.readdirSync(root)){
    if(!name.endsWith('.mjs'))continue;
    const p=path.join(root,name);
    let s=fs.readFileSync(p,'utf8');
    if(!s.includes('101-bf07-toolchain-package-hardening'))continue;
    const before=s;
    s=s.replaceAll('101-bf07-toolchain-package-hardening)/',`101-bf07-toolchain-package-hardening|${successor})/`);
    s=s.replaceAll('101-bf07-toolchain-package-hardening/',`101-bf07-toolchain-package-hardening|${successor}/`);
    if(s!==before){fs.writeFileSync(p,s);changed.push(p)}
  }
}
console.log(`normalized ${changed.length} files`);
for(const p of changed)console.log(p);
if(!changed.length)throw new Error('no remaining stale cache successor assertions found');
