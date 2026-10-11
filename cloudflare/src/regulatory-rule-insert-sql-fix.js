const REGULATORY_RULE_INSERT_MARKER="INSERT INTO regulatory_rules(";
const MALFORMED_DRAFT_VALUES="VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)";
const CORRECT_DRAFT_VALUES="VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)";

export function normalizeRegulatoryRuleInsertSql(sql){
  const source=String(sql??"");
  if(!source.includes(REGULATORY_RULE_INSERT_MARKER)||!source.includes(MALFORMED_DRAFT_VALUES))return source;
  return source.replace(MALFORMED_DRAFT_VALUES,CORRECT_DRAFT_VALUES);
}

export function withRegulatoryRuleInsertFix(db){
  if(!db||typeof db.prepare!=="function")return db;
  return new Proxy(db,{
    get(target,prop){
      if(prop==="prepare")return sql=>target.prepare(normalizeRegulatoryRuleInsertSql(sql));
      const value=Reflect.get(target,prop,target);
      return typeof value==="function"?value.bind(target):value;
    }
  });
}
