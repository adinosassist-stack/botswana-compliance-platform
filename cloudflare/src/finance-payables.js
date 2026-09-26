const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_LIST=100;
const EXPENSE_CATEGORIES=new Set(["inventory","materials","rent","utilities","payroll","transport","marketing","tax","loan","equipment","professional_services","other"]);

const text=(value,max=240)=>String(value??"").trim().slice(0,max);
const integer=value=>Number.isSafeInteger(Number(value))?Number(value):null;
const frozen=value=>Object.freeze(value);

function validDate(value){
  const v=text(value,10);
  if(!ISO_DATE.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function businessDate(value=new Date()){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(value)}
  catch{return value.toISOString().slice(0,10)}
}
function normalizeSupplierIdentity(value){
  return text(value,200).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim().slice(0,160);
}
function normalizeExpenseCategory(value){
  const key=text(value,40).toLowerCase();
  return EXPENSE_CATEGORIES.has(key)?key:null;
}
function payableAllocationPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/payables\/([^/]+)\/allocations$/);
  return match?{payableId:text(match[1],64)}:null;
}
function payableAllocationReversePath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/payables\/([^/]+)\/allocations\/([^/]+)\/reverse$/);
  return match?{payableId:text(match[1],64),allocationId:text(match[2],64)}:null;
}
function payableVoidPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/payables\/([^/]+)\/void$/);
  return match?{payableId:text(match[1],64)}:null;
}
function supplierAliasesPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/suppliers\/([^/]+)\/aliases$/);
  return match?{supplierId:text(match[1],64)}:null;
}
function allocationCte(){
  return "WITH allocation_net AS ("+
    " SELECT payable_id,SUM(CASE WHEN entry_type='apply' THEN amount_minor ELSE -amount_minor END) allocated_minor"+
    " FROM finance_payable_allocations WHERE tenant_id=? GROUP BY payable_id"+
    "), open_payables AS ("+
    " SELECT p.id,p.supplier_id,s.name supplier_name,p.payable_number,p.issued_on,p.due_on,p.description,p.expense_category,p.total_minor,"+
    " COALESCE(a.allocated_minor,0) allocated_minor,p.total_minor-COALESCE(a.allocated_minor,0) outstanding_minor"+
    " FROM finance_payables p"+
    " JOIN finance_suppliers s ON s.id=p.supplier_id AND s.tenant_id=p.tenant_id"+
    " LEFT JOIN allocation_net a ON a.payable_id=p.id"+
    " WHERE p.tenant_id=? AND p.status='open' AND p.total_minor>COALESCE(a.allocated_minor,0)"+
    ") ";
}
export async function financePayablesSummary(env,tenantId,{businessDate:date=businessDate(),supplierLimit=10,payableLimit=30}={}){
  const supplierCap=Math.min(25,Math.max(1,Number(supplierLimit)||10));
  const payableCap=Math.min(50,Math.max(1,Number(payableLimit)||30));
  const cte=allocationCte();
  try{
    const [summary,suppliers,payables]=await Promise.all([
      env.DB.prepare(cte+
        "SELECT COUNT(*) outstanding_payable_count,COALESCE(SUM(outstanding_minor),0) outstanding_minor,"+
        " SUM(CASE WHEN due_on<? THEN 1 ELSE 0 END) overdue_payable_count,"+
        " COALESCE(SUM(CASE WHEN due_on<? THEN outstanding_minor ELSE 0 END),0) overdue_minor,"+
        " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+7 days') THEN outstanding_minor ELSE 0 END),0) due_7d_minor,"+
        " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+14 days') THEN outstanding_minor ELSE 0 END),0) due_14d_minor,"+
        " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+30 days') THEN outstanding_minor ELSE 0 END),0) due_30d_minor,"+
        " COUNT(DISTINCT supplier_id) supplier_count"+
        " FROM open_payables"
      ).bind(tenantId,tenantId,date,date,date,date,date,date,date,date).first(),
      env.DB.prepare(cte+
        "SELECT supplier_id,supplier_name,COUNT(*) outstanding_payable_count,SUM(outstanding_minor) outstanding_minor,"+
        " SUM(CASE WHEN due_on<? THEN 1 ELSE 0 END) overdue_payable_count,"+
        " COALESCE(SUM(CASE WHEN due_on<? THEN outstanding_minor ELSE 0 END),0) overdue_minor,MIN(due_on) earliest_due_on"+
        " FROM open_payables GROUP BY supplier_id,supplier_name ORDER BY outstanding_minor DESC,supplier_name ASC LIMIT ?"
      ).bind(tenantId,tenantId,date,date,supplierCap).all(),
      env.DB.prepare(cte+
        "SELECT id,supplier_id,supplier_name,payable_number,issued_on,due_on,description,expense_category,total_minor,allocated_minor,outstanding_minor,"+
        " CASE WHEN due_on<? THEN 1 ELSE 0 END overdue"+
        " FROM open_payables ORDER BY due_on ASC,outstanding_minor DESC LIMIT ?"
      ).bind(tenantId,tenantId,date,payableCap).all()
    ]);
    return frozen({
      available:true,currency:"BWP",businessDate:date,
      outstandingPayableCount:Number(summary?.outstanding_payable_count||0),
      outstandingMinor:Number(summary?.outstanding_minor||0),
      overduePayableCount:Number(summary?.overdue_payable_count||0),
      overdueMinor:Number(summary?.overdue_minor||0),
      due7dMinor:Number(summary?.due_7d_minor||0),
      due14dMinor:Number(summary?.due_14d_minor||0),
      due30dMinor:Number(summary?.due_30d_minor||0),
      supplierCount:Number(summary?.supplier_count||0),
      suppliers:frozen((suppliers.results||[]).map(row=>frozen({
        supplierId:String(row.supplier_id||""),supplierName:text(row.supplier_name,160),
        outstandingPayableCount:Number(row.outstanding_payable_count||0),outstandingMinor:Number(row.outstanding_minor||0),
        overduePayableCount:Number(row.overdue_payable_count||0),overdueMinor:Number(row.overdue_minor||0),
        earliestDueOn:row.earliest_due_on||null
      }))),
      payables:frozen((payables.results||[]).map(row=>frozen({
        id:String(row.id||""),supplierId:String(row.supplier_id||""),supplierName:text(row.supplier_name,160),
        payableNumber:text(row.payable_number,80),issuedOn:row.issued_on||null,dueOn:row.due_on||null,
        description:text(row.description,500),expenseCategory:text(row.expense_category,40),
        totalMinor:Number(row.total_minor||0),allocatedMinor:Number(row.allocated_minor||0),
        outstandingMinor:Number(row.outstanding_minor||0),overdue:Number(row.overdue||0)===1
      }))),
      authority:frozen({canonical:true,providerNeutral:true,source:"finance_payables_plus_transaction_allocations",estimated:false,moneyMovement:false})
    });
  }catch{
    return frozen({available:false,currency:"BWP",businessDate:date,error:"finance_payables_unavailable",authority:frozen({canonical:false,moneyMovement:false})});
  }
}
async function payableDetail(env,tenantId,payableId){
  return await env.DB.prepare(
    "SELECT p.id,p.supplier_id,s.name supplier_name,p.payable_number,p.issued_on,p.due_on,p.description,p.expense_category,p.total_minor,p.currency,p.status,p.created_at,"+
    " COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor WHEN a.entry_type='reverse' THEN -a.amount_minor ELSE 0 END),0) allocated_minor"+
    " FROM finance_payables p JOIN finance_suppliers s ON s.id=p.supplier_id AND s.tenant_id=p.tenant_id"+
    " LEFT JOIN finance_payable_allocations a ON a.payable_id=p.id AND a.tenant_id=p.tenant_id"+
    " WHERE p.tenant_id=? AND p.id=? GROUP BY p.id,p.supplier_id,s.name,p.payable_number,p.issued_on,p.due_on,p.description,p.expense_category,p.total_minor,p.currency,p.status,p.created_at LIMIT 1"
  ).bind(tenantId,payableId).first();
}
export async function handleFinancePayablesRequest({request,url,env,auth,json,readJson,id,appendLineage,writeAudit,sha256Hex,roleAllowed=()=>false}={}){
  const path=String(url?.pathname||"");
  if(!path.startsWith("/api/finance/"))return null;

  if(path==="/api/finance/payables/summary"&&request.method==="GET")return json(await financePayablesSummary(env,auth.tenant_id));

  if(path==="/api/finance/suppliers"&&request.method==="GET"){
    try{
      const rows=await env.DB.prepare("SELECT id,supplier_code,name,default_expense_category,status,created_at,updated_at FROM finance_suppliers WHERE tenant_id=? ORDER BY status,name LIMIT ?").bind(auth.tenant_id,MAX_LIST).all();
      return json({items:rows.results||[],authority:{canonical:true,providerNeutral:true,source:"finance_suppliers"}});
    }catch{return json({error:"finance_suppliers_unavailable"},503)}
  }
  if(path==="/api/finance/suppliers"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024}),name=text(body.name,160),supplierCode=text(body.supplierCode,80)||null;
    const normalizedName=normalizeSupplierIdentity(name),category=normalizeExpenseCategory(body.defaultExpenseCategory||"other");
    if(name.length<2||normalizedName.length<2)return json({error:"supplier_name_required"},400);
    if(!category)return json({error:"invalid_expense_category"},400);
    const supplierId=id();
    try{
      await env.DB.prepare("INSERT INTO finance_suppliers(id,tenant_id,supplier_code,name,normalized_name,default_expense_category,status,created_by_user_id) VALUES(?,?,?,?,?,?,'active',?)")
        .bind(supplierId,auth.tenant_id,supplierCode,name,normalizedName,category,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"finance_supplier_exists"},409);
      return json({error:"finance_supplier_write_failed"},503);
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"SUPPLIER_CREATED",entityType:"finance_supplier",entityId:supplierId,payload:{supplierCode,name,defaultExpenseCategory:category},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_SUPPLIER_CREATED",{supplierId,supplierCode,defaultExpenseCategory:category});
    return json({ok:true,id:supplierId,supplierCode,name,defaultExpenseCategory:category,status:"active"},201);
  }

  const aliasRoute=supplierAliasesPath(path);
  if(aliasRoute&&request.method==="POST"){
    if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
    const body=await readJson(request,{maxBytes:8*1024}),aliasText=text(body.alias,160),normalizedAlias=normalizeSupplierIdentity(aliasText);
    if(normalizedAlias.length<2)return json({error:"supplier_alias_required"},400);
    const supplier=await env.DB.prepare("SELECT id FROM finance_suppliers WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(aliasRoute.supplierId,auth.tenant_id).first();
    if(!supplier)return json({error:"finance_supplier_not_found"},404);
    const canonicalCollision=await env.DB.prepare("SELECT id FROM finance_suppliers WHERE tenant_id=? AND normalized_name=? AND id<>? LIMIT 1").bind(auth.tenant_id,normalizedAlias,aliasRoute.supplierId).first();
    if(canonicalCollision)return json({error:"finance_supplier_alias_canonical_collision"},409);
    const aliasId=id();
    try{
      await env.DB.prepare("INSERT INTO finance_supplier_aliases(id,tenant_id,supplier_id,alias_text,normalized_alias,source_kind,created_by_user_id) VALUES(?,?,?,?,?,'owner_confirmed',?)")
        .bind(aliasId,auth.tenant_id,aliasRoute.supplierId,aliasText,normalizedAlias,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"finance_supplier_alias_exists"},409);
      return json({error:"finance_supplier_alias_write_failed"},503);
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"SUPPLIER_ALIAS_CONFIRMED",entityType:"finance_supplier_alias",entityId:aliasId,payload:{supplierId:aliasRoute.supplierId,aliasHash:await sha256Hex(normalizedAlias),sourceKind:"owner_confirmed"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_SUPPLIER_ALIAS_CONFIRMED",{supplierId:aliasRoute.supplierId,aliasId});
    return json({ok:true,id:aliasId,supplierId:aliasRoute.supplierId,alias:aliasText,sourceKind:"owner_confirmed"},201);
  }

  if(path==="/api/finance/payables"&&request.method==="GET"){
    const summary=await financePayablesSummary(env,auth.tenant_id,{payableLimit:MAX_LIST,supplierLimit:25});
    return summary.available?json({items:summary.payables,currency:"BWP",businessDate:summary.businessDate,authority:summary.authority}):json({error:"finance_payables_unavailable"},503);
  }
  if(path==="/api/finance/payables"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024}),supplierId=text(body.supplierId,64),payableNumber=text(body.payableNumber,80);
    const issuedOn=text(body.issuedOn,10),dueOn=text(body.dueOn,10),description=text(body.description,500),totalMinor=integer(body.totalMinor);
    if(!payableNumber)return json({error:"payable_number_required"},400);
    if(!validDate(issuedOn)||!validDate(dueOn)||dueOn<issuedOn)return json({error:"invalid_payable_dates"},400);
    if(totalMinor===null||totalMinor<=0)return json({error:"invalid_payable_total_minor"},400);
    const supplier=await env.DB.prepare("SELECT id,name,default_expense_category FROM finance_suppliers WHERE id=? AND tenant_id=? AND status='active' LIMIT 1").bind(supplierId,auth.tenant_id).first();
    if(!supplier)return json({error:"finance_supplier_not_found"},404);
    const category=normalizeExpenseCategory(body.expenseCategory||supplier.default_expense_category||"other");
    if(!category)return json({error:"invalid_expense_category"},400);
    const payableId=id();
    try{
      await env.DB.prepare("INSERT INTO finance_payables(id,tenant_id,supplier_id,payable_number,issued_on,due_on,description,total_minor,currency,status,expense_category,created_by_user_id) VALUES(?,?,?,?,?,?,?,?, 'BWP','open',?,?)")
        .bind(payableId,auth.tenant_id,supplierId,payableNumber,issuedOn,dueOn,description,totalMinor,category,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"finance_payable_exists_or_invalid"},409);
      return json({error:"finance_payable_write_failed"},503);
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"PAYABLE_RECORDED",entityType:"finance_payable",entityId:payableId,payload:{supplierId,payableNumber,issuedOn,dueOn,totalMinor,currency:"BWP",expenseCategory:category},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_PAYABLE_RECORDED",{payableId,supplierId,payableNumber,totalMinor,dueOn,expenseCategory:category});
    return json({ok:true,id:payableId,supplierId,supplierName:supplier.name,payableNumber,issuedOn,dueOn,totalMinor,outstandingMinor:totalMinor,currency:"BWP",status:"open",expenseCategory:category},201);
  }

  const allocationRoute=payableAllocationPath(path);
  if(allocationRoute&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:8*1024}),transactionId=text(body.transactionId,64),amountMinor=integer(body.amountMinor);
    const idempotencyKey=text(request.headers.get("idempotency-key")||body.idempotencyKey,120);
    if(!transactionId)return json({error:"finance_transaction_id_required"},400);
    if(amountMinor===null||amountMinor<=0)return json({error:"invalid_allocation_amount_minor"},400);
    if(idempotencyKey.length<8)return json({error:"idempotency_key_required"},400);
    const payable=await payableDetail(env,auth.tenant_id,allocationRoute.payableId);
    if(!payable||payable.status!=="open")return json({error:"finance_payable_not_allocatable"},404);
    const transaction=await env.DB.prepare("SELECT id,posted_on,amount_minor FROM finance_transactions WHERE id=? AND tenant_id=? AND amount_minor<0 LIMIT 1").bind(transactionId,auth.tenant_id).first();
    if(!transaction)return json({error:"finance_transaction_not_allocatable"},404);
    const allocationId=(await sha256Hex(JSON.stringify([auth.tenant_id,allocationRoute.payableId,transactionId,idempotencyKey]))).slice(0,64);
    const existing=await env.DB.prepare("SELECT id,payable_id,transaction_id,amount_minor,entry_type FROM finance_payable_allocations WHERE id=? AND tenant_id=? LIMIT 1").bind(allocationId,auth.tenant_id).first();
    if(existing){
      if(existing.payable_id!==allocationRoute.payableId||existing.transaction_id!==transactionId||Number(existing.amount_minor)!==amountMinor||existing.entry_type!=="apply")return json({error:"idempotency_key_conflict"},409);
      return json({ok:true,id:allocationId,payableId:allocationRoute.payableId,transactionId,amountMinor,currency:"BWP",replayed:true});
    }
    try{
      await env.DB.prepare("INSERT INTO finance_payable_allocations(id,tenant_id,payable_id,transaction_id,amount_minor,entry_type,reverses_allocation_id,created_by_user_id) VALUES(?,?,?,?,?,'apply',NULL,?)")
        .bind(allocationId,auth.tenant_id,allocationRoute.payableId,transactionId,amountMinor,auth.user_id).run();
    }catch(error){
      const message=String(error);
      if(message.includes("finance_payable_overallocation"))return json({error:"finance_payable_overallocation"},409);
      if(message.includes("finance_transaction_overallocation"))return json({error:"finance_transaction_overallocation"},409);
      if(message.includes("finance_payable_not_allocatable")||message.includes("finance_transaction_not_allocatable"))return json({error:"finance_allocation_scope_invalid"},409);
      return json({error:"finance_payable_allocation_failed"},503);
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"PAYABLE_PAYMENT_ALLOCATED",entityType:"finance_payable_allocation",entityId:allocationId,payload:{payableId:allocationRoute.payableId,transactionId,amountMinor,transactionPostedOn:transaction.posted_on,currency:"BWP"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_PAYABLE_PAYMENT_ALLOCATED",{allocationId,payableId:allocationRoute.payableId,transactionId,amountMinor});
    const updated=await payableDetail(env,auth.tenant_id,allocationRoute.payableId);
    return json({ok:true,id:allocationId,payableId:allocationRoute.payableId,transactionId,amountMinor,currency:"BWP",payableOutstandingMinor:Math.max(0,Number(updated?.total_minor||0)-Number(updated?.allocated_minor||0))},201);
  }

  const reverseRoute=payableAllocationReversePath(path);
  if(reverseRoute&&request.method==="POST"){
    const original=await env.DB.prepare("SELECT id,payable_id,transaction_id,amount_minor,entry_type FROM finance_payable_allocations WHERE id=? AND tenant_id=? AND payable_id=? LIMIT 1").bind(reverseRoute.allocationId,auth.tenant_id,reverseRoute.payableId).first();
    if(!original||original.entry_type!=="apply")return json({error:"finance_payable_allocation_not_found"},404);
    const existingReverse=await env.DB.prepare("SELECT id FROM finance_payable_allocations WHERE tenant_id=? AND reverses_allocation_id=? LIMIT 1").bind(auth.tenant_id,reverseRoute.allocationId).first();
    if(existingReverse)return json({ok:true,id:existingReverse.id,reversesAllocationId:reverseRoute.allocationId,replayed:true});
    const reversalId=(await sha256Hex(JSON.stringify([auth.tenant_id,reverseRoute.allocationId,"reverse"]))).slice(0,64);
    try{
      await env.DB.prepare("INSERT INTO finance_payable_allocations(id,tenant_id,payable_id,transaction_id,amount_minor,entry_type,reverses_allocation_id,created_by_user_id) VALUES(?,?,?,?,?,'reverse',?,?)")
        .bind(reversalId,auth.tenant_id,reverseRoute.payableId,original.transaction_id,Number(original.amount_minor),reverseRoute.allocationId,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error))){
        const replay=await env.DB.prepare("SELECT id FROM finance_payable_allocations WHERE tenant_id=? AND reverses_allocation_id=? LIMIT 1").bind(auth.tenant_id,reverseRoute.allocationId).first();
        if(replay)return json({ok:true,id:replay.id,reversesAllocationId:reverseRoute.allocationId,replayed:true});
      }
      return json({error:"finance_payable_allocation_reverse_failed"},503);
    }
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"PAYABLE_PAYMENT_ALLOCATION_REVERSED",entityType:"finance_payable_allocation",entityId:reversalId,payload:{payableId:reverseRoute.payableId,transactionId:original.transaction_id,amountMinor:Number(original.amount_minor),reversesAllocationId:reverseRoute.allocationId,currency:"BWP"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_PAYABLE_PAYMENT_ALLOCATION_REVERSED",{allocationId:reversalId,reversesAllocationId:reverseRoute.allocationId,payableId:reverseRoute.payableId,transactionId:original.transaction_id,amountMinor:Number(original.amount_minor)});
    return json({ok:true,id:reversalId,reversesAllocationId:reverseRoute.allocationId,currency:"BWP"},201);
  }

  const voidRoute=payableVoidPath(path);
  if(voidRoute&&request.method==="POST"){
    const payable=await payableDetail(env,auth.tenant_id,voidRoute.payableId);
    if(!payable)return json({error:"finance_payable_not_found"},404);
    if(payable.status==="void")return json({ok:true,id:voidRoute.payableId,status:"void",replayed:true});
    if(Number(payable.allocated_minor||0)!==0)return json({error:"finance_payable_has_active_allocations"},409);
    const result=await env.DB.prepare("UPDATE finance_payables SET status='void' WHERE id=? AND tenant_id=? AND status='open'").bind(voidRoute.payableId,auth.tenant_id).run();
    if(Number(result?.meta?.changes||0)!==1)return json({error:"finance_payable_state_conflict"},409);
    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"PAYABLE_VOIDED",entityType:"finance_payable",entityId:voidRoute.payableId,payload:{payableNumber:payable.payable_number,totalMinor:Number(payable.total_minor),currency:"BWP"},sha256Hex,id});
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_PAYABLE_VOIDED",{payableId:voidRoute.payableId,payableNumber:payable.payable_number,totalMinor:Number(payable.total_minor)});
    return json({ok:true,id:voidRoute.payableId,status:"void"});
  }
  return null;
}

export const __financePayablesTest=frozen({
  validDate,businessDate,normalizeSupplierIdentity,normalizeExpenseCategory,
  payableAllocationPath,payableAllocationReversePath,payableVoidPath,supplierAliasesPath,EXPENSE_CATEGORIES
});
