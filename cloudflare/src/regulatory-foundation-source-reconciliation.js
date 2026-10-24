// Source metadata reconciliation for governed Botswana foundation-pack imports.
// This deliberately cannot approve a source, modify a snapshot, or publish rules.

export const SOURCE_METADATA_FIELDS=Object.freeze([
  "authority","title","source_url","source_type","publication_date","effective_date","notes"
]);

export function foundationSourceDesired(src,packKey){
  return {
    authority:String(src.authority||""),
    title:String(src.title||""),
    source_url:String(src.url||""),
    source_type:String(src.type||"official"),
    publication_date:src.publicationDate||null,
    effective_date:src.effectiveDate||null,
    notes:`[FOUNDATION PACK ${packKey}] ${src.notes||""}`
  };
}

export function foundationSourceMetadataDiff(row,desired){
  return SOURCE_METADATA_FIELDS.filter(field=>(row?.[field]??null)!==(desired?.[field]??null));
}

export function foundationSourceDisposition(row,desired){
  if(!row)return {action:"create",fields:[]};
  const fields=foundationSourceMetadataDiff(row,desired);
  if(!fields.length)return {action:"reuse",fields:[]};
  const protectedEvidence=
    String(row.status||"")!=="pending"||
    String(row.verification_status||"")!=="unverified"||
    Number(row.latest_snapshot_version||0)>0||
    Number(row.snapshot_count||0)>0||
    Number(row.review_count||0)>0||
    Boolean(row.content_hash||row.metadata_hash||row.approved_by_user_id||row.approved_at);
  if(protectedEvidence||fields.includes("source_url"))return {action:"source_metadata_drift_requires_review",fields};
  return {action:"refresh_unreviewed",fields};
}

const LOOKUP_BASE=`SELECT s.*, 
  (SELECT COUNT(*) FROM regulatory_source_snapshots snap WHERE snap.source_id=s.id) AS snapshot_count,
  (SELECT COUNT(*) FROM regulatory_source_reviews rev WHERE rev.source_id=s.id) AS review_count
  FROM regulatory_sources s`;

export async function inspectFoundationSourceMetadata(db,pack){
  const items=[];
  for(const src of pack.sources){
    const seedKey=`source:${src.key}`,desired=foundationSourceDesired(src,pack.packKey);
    const registry=await db.prepare("SELECT entity_id,definition_hash FROM regulatory_seed_registry WHERE pack_key=? AND seed_key=? AND entity_type='source' LIMIT 1").bind(pack.packKey,seedKey).first();
    let row=registry?.entity_id
      ?await db.prepare(`${LOOKUP_BASE} WHERE s.id=? LIMIT 1`).bind(registry.entity_id).first()
      :null;
    if(!row)row=await db.prepare(`${LOOKUP_BASE} WHERE s.source_url=? ORDER BY s.created_at,s.id LIMIT 1`).bind(src.url).first();
    const disposition=foundationSourceDisposition(row,desired);
    items.push({
      key:src.key,seedKey,sourceId:row?.id||null,registryHash:registry?.definition_hash||null,
      desired,observed:row||null,action:disposition.action,changedFields:disposition.fields,
      status:row?.status||null,verificationStatus:row?.verification_status||null,
      snapshotCount:Number(row?.snapshot_count||0),reviewCount:Number(row?.review_count||0)
    });
  }
  const counts={create:0,reuse:0,refresh_unreviewed:0,source_metadata_drift_requires_review:0};
  for(const item of items)counts[item.action]++;
  return {ok:counts.source_metadata_drift_requires_review===0,packKey:pack.packKey,version:pack.version,counts,items};
}

export function publicFoundationSourcePreflight(result){
  return {
    ok:result.ok,packKey:result.packKey,version:result.version,counts:result.counts,
    sources:result.items.map(item=>({
      key:item.key,sourceId:item.sourceId,action:item.action,changedFields:item.changedFields,
      status:item.status,verificationStatus:item.verificationStatus,
      snapshotCount:item.snapshotCount,reviewCount:item.reviewCount
    }))
  };
}

export async function updateUnreviewedFoundationSourceMetadata(db,item){
  if(item.action!=="refresh_unreviewed"||!item.sourceId)throw new Error("foundation_source_update_requires_preflight");
  const d=item.desired,o=item.observed;
  // Compare-and-swap every original field. An approval, review, snapshot or
  // concurrent metadata edit between the read-only preflight and this write
  // stops the update rather than overwriting evidence.
  const changes=await db.prepare(`UPDATE regulatory_sources SET
    authority=?,title=?,source_type=?,publication_date=?,effective_date=?,notes=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='pending' AND verification_status='unverified'
      AND latest_snapshot_version=0
      AND content_hash IS NULL AND metadata_hash IS NULL
      AND approved_by_user_id IS NULL AND approved_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM regulatory_source_snapshots WHERE source_id=regulatory_sources.id)
      AND NOT EXISTS(SELECT 1 FROM regulatory_source_reviews WHERE source_id=regulatory_sources.id)
      AND authority IS ? AND title IS ? AND source_url IS ? AND source_type IS ?
      AND publication_date IS ? AND effective_date IS ? AND notes IS ?`)
    .bind(d.authority,d.title,d.source_type,d.publication_date,d.effective_date,d.notes,item.sourceId,
      o.authority,o.title,o.source_url,o.source_type,o.publication_date,o.effective_date,o.notes).run();
  if(Number(changes.meta?.changes??changes.changes??0)!==1){
    return {ok:false,error:"source_metadata_changed_during_import",key:item.key,sourceId:item.sourceId};
  }
  return {ok:true,sourceId:item.sourceId,changedFields:item.changedFields};
}
