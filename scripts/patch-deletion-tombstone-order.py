from pathlib import Path

path = Path('cloudflare/src/worker.js')
text = path.read_text()
start_marker = "  purgeStatements.push(\n    env.DB.prepare(`DELETE FROM users WHERE id IN ("
end_marker = "  );\n  await env.DB.batch(purgeStatements);"
start = text.find(start_marker)
if start < 0:
    raise SystemExit('expected deletion purge block start not found')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('expected deletion purge block end not found')
if text.find(start_marker, start + 1) >= 0:
    raise SystemExit('deletion purge block start is not unique')

replacement = """  purgeStatements.push(
    env.DB.prepare(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged)
      SELECT ?,?,'v2',?,?,? WHERE EXISTS(SELECT 1 FROM deletion_requests WHERE id=? AND tenant_id=? AND status='processing' AND processing_token=?)`)
      .bind(dr.id,tenantFingerprint,evidenceRecords,evidenceObjects,uniqueUsers,dr.id,dr.tenant_id,claimToken),
    env.DB.prepare(`DELETE FROM users WHERE id IN (
      SELECT m.user_id FROM memberships m WHERE m.tenant_id=? AND NOT EXISTS (
        SELECT 1 FROM memberships other WHERE other.user_id=m.user_id AND other.tenant_id<>m.tenant_id
      )
    )`).bind(dr.tenant_id),
    env.DB.prepare("DELETE FROM tenants WHERE id=? AND EXISTS(SELECT 1 FROM deletion_tombstones WHERE request_id=? AND tenant_fingerprint=?)")
      .bind(dr.tenant_id,dr.id,tenantFingerprint)
  );
"""

text = text[:start] + replacement + text[end + len("  );\n"):]
path.write_text(text)
print('patched deletion tombstone ordering')
