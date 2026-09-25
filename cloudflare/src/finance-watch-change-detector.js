export const FINANCE_WATCH_CHANGE_DETECTOR_VERSION="2026-09-25.v1";
const stable=v=>JSON.stringify(v,Object.keys(v||{}).sort());
export async function snapshotHash(value={}){const b=new TextEncoder().encode(stable(value));const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function detectSnapshotChange({previousHash=null,snapshot={}}={}){const currentHash=await snapshotHash(snapshot);return Object.freeze({changed:!previousHash||previousHash!==currentHash,previousHash:previousHash||null,currentHash,executionAllowed:false})}
