import crypto from 'node:crypto';
export const REGISTRATION_RESPONSE_MIN_MS=450;
export const REGISTRATION_RESPONSE_JITTER_MS=50;
export async function registrationTimingFloor(startedAt,{minMs=REGISTRATION_RESPONSE_MIN_MS,jitterMs=REGISTRATION_RESPONSE_JITTER_MS}={}){
  const safeMin=Math.max(0,Math.min(5000,Number(minMs)||0));
  const safeJitter=Math.max(0,Math.min(1000,Number(jitterMs)||0));
  const jitter=safeJitter>0?crypto.randomInt(0,safeJitter+1):0;
  const elapsed=Math.max(0,Date.now()-Number(startedAt||Date.now()));
  const wait=Math.max(0,safeMin+jitter-elapsed);
  if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  return {elapsedMs:Date.now()-Number(startedAt||Date.now()),targetMs:safeMin+jitter};
}
