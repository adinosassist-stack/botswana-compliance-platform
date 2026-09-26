export const FINANCE_WATCH_CHANGE_DETECTOR_VERSION="2026-09-26.v2";
function canonical(value,seen=new WeakSet()){
  if(value===null||typeof value!=="object")return value;
  if(seen.has(value))throw new TypeError("snapshot_cycle_not_supported");
  seen.add(value);
  let out;
  if(Array.isArray(value))out=value.map(item=>canonical(item,seen));
  else{out={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key],seen)}
  seen.delete(value);return out;
}
const stable=value=>JSON.stringify(canonical(value));
export async function snapshotHash(value={}){const b=new TextEncoder().encode(stable(value));const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function detectSnapshotChange({previousHash=null,snapshot={}}={}){const currentHash=await snapshotHash(snapshot);return Object.freeze({changed:!previousHash||previousHash!==currentHash,previousHash:previousHash||null,currentHash,executionAllowed:false})}
export const __financeWatchChangeDetectorTest=Object.freeze({canonical,stable});
