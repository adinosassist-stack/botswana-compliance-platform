/**
 * UNMOUNTED read-only AI-export authorization boundary.
 * The caller must supply an independently authenticated principal.
 * Never trust object keys, tenant identifiers or actor identifiers supplied
 * by the requesting browser. This module registers no HTTP route.
 */
const validId = value => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value) && !value.includes('..');
export function createAuthorizedAiExportReader({metadata,storage,clock=()=>Date.now()}={}){
  if(!metadata || typeof metadata.find !== 'function' ||
     !storage || typeof storage.getObject !== 'function' ||
     typeof clock !== 'function') throw new TypeError('authorized_export_dependencies_required');
  return Object.freeze({
    async read({principal,jobId}={}){
      // Fail closed without reading metadata or storage for unauthenticated requests.
      if(principal?.authenticated !== true || !validId(principal.tenantId) ||
         !validId(principal.actorId) || !validId(jobId)) return null;
      try {
        const now=clock();
        if(!Number.isSafeInteger(now) || now < 0) return null;
        const record=await metadata.find({
          id:jobId,tenantId:principal.tenantId,actorId:principal.actorId
        });
        const key=`ai-exports/${principal.tenantId}/${jobId}`;
        if(record?.id !== jobId || record.tenantId !== principal.tenantId ||
           record.actorId !== principal.actorId || record.status !== 'completed' ||
           record.objectKey !== key || !Number.isSafeInteger(record.expiresAt) ||
           record.expiresAt <= now) return null;
        // Never accept key from browser. Storage verifies the R2 body digest and
        // its own expiry metadata separately.
        return await storage.getObject({key,visibility:'private'});
      }catch{
        // No identities, object keys, provider error text or secret values exposed.
        return null;
      }
    }
  });
}
