from pathlib import Path

path=Path('cloudflare/src/finance-core.js')
s=path.read_text()

def replace_once(old,new,label):
    global s
    count=s.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    s=s.replace(old,new,1)

replace_once(
'''function importContentFingerprintBasis({tenantId,accountId,sourceType,provider,rows}){\n  const canonicalRows=(rows||[]).map(row=>JSON.stringify([text(row?.postedOn,10),integer(row?.amountMinor),text(row?.reference,160),text(row?.description,500),text(row?.sourceId,160)])).sort();\n  return [String(tenantId||""),String(accountId||""),String(sourceType||""),String(provider||""),canonicalRows];\n}''',
'''function importContentFingerprintBasis({tenantId,accountId,rows}){\n  const canonicalRows=(rows||[]).map(row=>JSON.stringify([text(row?.postedOn,10),integer(row?.amountMinor),text(row?.reference,160),text(row?.description,500)])).sort();\n  return [String(tenantId||""),String(accountId||""),"user_import",canonicalRows];\n}''',
'content fingerprint basis')

replace_once(
'''  if((rows||[]).some(row=>text(row?.sourceId,160)))return null;\n  const candidates=await env.DB.prepare(`SELECT b.id FROM finance_import_batches b\n    WHERE b.tenant_id=? AND b.account_id=? AND b.source_type=? AND COALESCE(b.provider,'')=? AND b.row_count=? AND b.status='completed' AND b.imported_count=b.row_count\n      AND NOT EXISTS (SELECT 1 FROM finance_import_batches l WHERE l.tenant_id=b.tenant_id AND l.id=?||b.id)\n    ORDER BY b.created_at DESC,b.id DESC LIMIT ?`).bind(tenantId,accountId,sourceType,provider||"",rows.length,IMPORT_CONTENT_LOCK_ID_PREFIX,MAX_LEGACY_CONTENT_CANDIDATES+1).all();''',
'''  const candidates=await env.DB.prepare(`SELECT b.id FROM finance_import_batches b\n    WHERE b.tenant_id=? AND b.account_id=? AND b.source_type IN ('manual','csv') AND b.row_count=? AND b.status='completed' AND b.imported_count=b.row_count\n      AND NOT EXISTS (SELECT 1 FROM finance_import_batches l WHERE l.tenant_id=b.tenant_id AND l.id=?||b.id)\n    ORDER BY b.created_at DESC,b.id DESC LIMIT ?`).bind(tenantId,accountId,rows.length,IMPORT_CONTENT_LOCK_ID_PREFIX,MAX_LEGACY_CONTENT_CANDIDATES+1).all();''',
'legacy candidate scope')

replace_once(
'''    const priorFingerprint=await sha256Hex(JSON.stringify(importContentFingerprintBasis({tenantId,accountId,sourceType,provider,rows:prior})));''',
'''    const priorFingerprint=await sha256Hex(JSON.stringify(importContentFingerprintBasis({tenantId,accountId,rows:prior})));''',
'legacy fingerprint')

replace_once(
'''    const contentFingerprint=sourceType==="adapter"?null:await sha256Hex(JSON.stringify(importContentFingerprintBasis({tenantId:auth.tenant_id,accountId,sourceType,provider,rows:normalized})));''',
'''    const contentFingerprint=sourceType==="adapter"?null:await sha256Hex(JSON.stringify(importContentFingerprintBasis({tenantId:auth.tenant_id,accountId,rows:normalized})));''',
'current request fingerprint')

path.write_text(s)
print('patched finance cross-key provenance bypass')
