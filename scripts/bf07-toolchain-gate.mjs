import {spawnSync} from 'node:child_process';
import {validateToolchain} from './bf07-toolchain-core.mjs';
const root=new URL('..',import.meta.url).pathname;
const npm=spawnSync('npm',['--version'],{encoding:'utf8',env:{...process.env,NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
if(npm.status!==0)throw new Error(`BF-07 toolchain check could not execute npm: ${String(npm.stderr||npm.stdout||'').trim()}`);
const actual={nodeVersion:process.versions.node,npmVersion:String(npm.stdout||'').trim()};
const expected=validateToolchain(root,actual);
console.log(`BF-07 toolchain gate passed: Node ${expected.node} / npm ${expected.npm}`);
