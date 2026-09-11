import fs from 'node:fs';
import path from 'node:path';

export function pinnedToolchain(root){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const node=fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim().replace(/^v/,'');
  const match=String(pkg.packageManager||'').match(/^npm@(\d+\.\d+\.\d+)$/);
  if(!/^\d+\.\d+\.\d+$/.test(node)||!match)throw new Error('BF-07 pinned Node/npm toolchain declaration is incomplete');
  return {node,npm:match[1]};
}

export function validateToolchain(root,{nodeVersion,npmVersion}){
  const expected=pinnedToolchain(root);
  if(String(nodeVersion||'')!==expected.node)throw new Error(`BF-07 toolchain mismatch: Node ${nodeVersion||'(missing)'}; expected ${expected.node}`);
  if(String(npmVersion||'')!==expected.npm)throw new Error(`BF-07 toolchain mismatch: npm ${npmVersion||'(missing)'}; expected ${expected.npm}`);
  return expected;
}
