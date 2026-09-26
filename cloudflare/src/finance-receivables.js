const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_RECEIVABLE_LIST=100;

const text=(value,max=240)=>String(value??"").trim().slice(0,max);
const integer=value=>Number.isSafeInteger(Number(value))?Number(value):null;

function validDate(value){
  const v=text(value,10);
  if(!ISO_DATE.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}

function gaboroneBusinessDate(value=new Date()){
  try{
    return new Intl.DateTimeFormat("en-CA",{
      timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(value);
  }catch{
    return value.toISOString().slice(0,10);
  }
}

function invoiceAllocationPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/invoices\/([^/]+)\/allocations$/);
  return match?{invoiceId:text(match[1],64)}:null;
}
function invoiceAllocationReversePath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/invoices\/([^/]+)\/allocations\/([^/]+)\/reverse$/);
  return match?{invoiceId:text(match[1],64),allocationId:text(match[2],64)}:null;
}
function invoiceVoidPath(pathname){
  const match=String(pathname||"").match(/^\/api\/finance\/invoices\/([^/]+)\/void$/);
  return match?{invoiceId:text(match[1],64)}:null;
}

export async function financeDailyCollections(env,tenantId,{businessDate=gaboroneBusinessDate()}={}){
  const row=await env.DB.prepare(
    "WITH tx_alloc AS ("+
    " SELECT transaction_id,SUM(CASE WHEN entry_type='apply' THEN amount_minor ELSE -amount_minor END) allocated_minor"+
    " FROM finance_invoice_allocations WHERE tenant_id=? GROUP BY transaction_id"+
    ") "+
    "SELECT "+
    " COALESCE(SUM(CASE WHEN t.amount_minor>0 THEN t.amount_minor ELSE 0 END),0) positive_inflow_minor,"+
    " SUM(CASE WHEN t.amount_minor>0 THEN 1 ELSE 0 END) positive_inflow_count,"+
    " COALESCE(SUM(CASE WHEN t.amount_minor<0 THEN ABS(t.amount_minor) ELSE 0 END),0) outflow_minor,"+
    " SUM(CASE WHEN t.amount_minor<0 THEN 1 ELSE 0 END) outflow_count,"+
    " COALESCE(SUM(CASE WHEN COALESCE(a.allocated_minor,0)>0 THEN a.allocated_minor ELSE 0 END),0) customer_collection_minor,"+
    " SUM(CASE WHEN COALESCE(a.allocated_minor,0)>0 THEN 1 ELSE 0 END) customer_collection_transaction_count"+
    " FROM finance_transactions t LEFT JOIN tx_alloc a ON a.transaction_id=t.id"+
    " WHERE t.tenant_id=? AND t.posted_on=?"
  ).bind(tenantId,tenantId,businessDate).first();
  const positiveInflowMinor=Number(row?.positive_inflow_minor||0);
  const customerCollectionMinor=Number(row?.customer_collection_minor||0);
  return Object.freeze({
    currency:"BWP",
    businessDate,
    positiveInflowMinor,
    positiveInflowCount:Number(row?.positive_inflow_count||0),
    outflowMinor:Number(row?.outflow_minor||0),
    outflowCount:Number(row?.outflow_count||0),
    customerCollectionMinor,
    customerCollectionTransactionCount:Number(row?.customer_collection_transaction_count||0),
    unclassifiedPositiveInflowMinor:Math.max(0,positiveInflowMinor-customerCollectionMinor),
    customerCollectionClassificationAvailable:true,
    qualification:"Customer collections include only positive Finance Core transactions explicitly allocated to issued invoices; unallocated positive inflows are not classified as customer collections."
  });
}

function allocationCte(){
  return "WITH allocation_net AS ("+
    " SELECT invoice_id,SUM(CASE WHEN entry_type='apply' THEN amount_minor ELSE -amount_minor END) allocated_minor"+
    " FROM finance_invoice_allocations WHERE tenant_id=? GROUP BY invoice_id"+
    "), open_invoices AS ("+
    " SELECT i.id,i.customer_id,c.name customer_name,i.invoice_number,i.issued_on,i.due_on,i.total_minor,"+
    " COALESCE(a.allocated_minor,0) allocated_minor,"+
    " i.total_minor-COALESCE(a.allocated_minor,0) outstanding_minor"+
    " FROM finance_invoices i"+
    " JOIN finance_customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id"+
    " LEFT JOIN allocation_net a ON a.invoice_id=i.id"+
    " WHERE i.tenant_id=? AND i.status='issued' AND i.total_minor>COALESCE(a.allocated_minor,0)"+
    ") ";
}

export async function financeReceivablesSummary(env,tenantId,{businessDate=gaboroneBusinessDate(),customerLimit=10,invoiceLimit=20}={}){
  const customerCap=Math.min(25,Math.max(1,Number(customerLimit)||10));
  const invoiceCap=Math.min(50,Math.max(1,Number(invoiceLimit)||20));
  const cte=allocationCte();
  const [summary,customers,invoices]=await Promise.all([
    env.DB.prepare(cte+
      "SELECT COUNT(*) outstanding_invoice_count,COALESCE(SUM(outstanding_minor),0) outstanding_minor,"+
      " SUM(CASE WHEN due_on<? THEN 1 ELSE 0 END) overdue_invoice_count,"+
      " COALESCE(SUM(CASE WHEN due_on<? THEN outstanding_minor ELSE 0 END),0) overdue_minor,"+
      " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+7 days') THEN outstanding_minor ELSE 0 END),0) due_7d_minor,"+
      " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+14 days') THEN outstanding_minor ELSE 0 END),0) due_14d_minor,"+
      " COALESCE(SUM(CASE WHEN due_on>=? AND due_on<=date(?,'+30 days') THEN outstanding_minor ELSE 0 END),0) due_30d_minor,"+
      " COUNT(DISTINCT customer_id) customer_count,"+
      " COUNT(DISTINCT CASE WHEN due_on<? THEN customer_id END) overdue_customer_count"+
      " FROM open_invoices"
    ).bind(tenantId,tenantId,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate).first(),
    env.DB.prepare(cte+
      "SELECT customer_id,customer_name,COUNT(*) outstanding_invoice_count,SUM(outstanding_minor) outstanding_minor,"+
      " SUM(CASE WHEN due_on<? THEN 1 ELSE 0 END) overdue_invoice_count,"+
      " SUM(CASE WHEN due_on<? THEN outstanding_minor ELSE 0 END) overdue_minor,MIN(due_on) earliest_due_on"+
      " FROM open_invoices GROUP BY customer_id,customer_name"+
      " ORDER BY outstanding_minor DESC,customer_name ASC LIMIT ?"
    ).bind(tenantId,tenantId,businessDate,businessDate,customerCap).all(),
    env.DB.prepare(cte+
      "SELECT id,customer_id,customer_name,invoice_number,issued_on,due_on,total_minor,allocated_minor,outstanding_minor,"+
      " CASE WHEN due_on<? THEN 1 ELSE 0 END overdue"+
      " FROM open_invoices ORDER BY overdue DESC,due_on ASC,outstanding_minor DESC LIMIT ?"
    ).bind(tenantId,tenantId,businessDate,invoiceCap).all()
  ]);
  return Object.freeze({
    currency:"BWP",
    businessDate,
    outstandingInvoiceCount:Number(summary?.outstanding_invoice_count||0),
    outstandingMinor:Number(summary?.outstanding_minor||0),
    overdueInvoiceCount:Number(summary?.overdue_invoice_count||0),
    overdueMinor:Number(summary?.overdue_minor||0),
    due7dMinor:Number(summary?.due_7d_minor||0),
    due14dMinor:Number(summary?.due_14d_minor||0),
    due30dMinor:Number(summary?.due_30d_minor||0),
    customerCount:Number(summary?.customer_count||0),
    overdueCustomerCount:Number(summary?.overdue_customer_count||0),
    customers:Object.freeze((customers.results||[]).map(row=>Object.freeze({
      customerId:String(row.customer_id||""),
      customerName:text(row.customer_name,160),
      outstandingInvoiceCount:Number(row.outstanding_invoice_count||0),
      outstandingMinor:Number(row.outstanding_minor||0),
      overdueInvoiceCount:Number(row.overdue_invoice_count||0),
      overdueMinor:Number(row.overdue_minor||0),
      earliestDueOn:row.earliest_due_on||null
    }))),
    invoices:Object.freeze((invoices.results||[]).map(row=>Object.freeze({
      id:String(row.id||""),
      customerId:String(row.customer_id||""),
      customerName:text(row.customer_name,160),
      invoiceNumber:text(row.invoice_number,80),
      issuedOn:row.issued_on||null,
      dueOn:row.due_on||null,
      totalMinor:Number(row.total_minor||0),
      allocatedMinor:Number(row.allocated_minor||0),
      outstandingMinor:Number(row.outstanding_minor||0),
      overdue:Number(row.overdue||0)===1
    }))),
    authority:Object.freeze({
      canonical:true,
      providerNeutral:true,
      source:"finance_invoices_plus_transaction_allocations",
      estimated:false,
      transactionBackedCollections:true
    })
  });
}


export async function financeReceivableCustomerLookup(env,tenantId,{customerQuery,businessDate=gaboroneBusinessDate(),invoiceLimit=20}={}){
  const query=text(customerQuery,160).toLowerCase();
  const authority=Object.freeze({
    canonical:true,
    providerNeutral:true,
    source:"finance_invoices_plus_transaction_allocations",
    estimated:false,
    matchPolicy:"exact_customer_name_or_code_only"
  });
  if(query.length<2)return Object.freeze({state:"invalid",currency:"BWP",businessDate,authority});
  const matches=await env.DB.prepare(
    "SELECT id,customer_code,name FROM finance_customers"+
    " WHERE tenant_id=? AND status='active' AND (lower(name)=? OR lower(COALESCE(customer_code,''))=?)"+
    " ORDER BY name,id LIMIT 3"
  ).bind(tenantId,query,query).all();
  const rows=matches.results||[];
  if(rows.length===0)return Object.freeze({state:"not_found",currency:"BWP",businessDate,query,authority});
  if(rows.length!==1){
    return Object.freeze({
      state:"ambiguous",currency:"BWP",businessDate,query,matchCount:rows.length,
      matches:Object.freeze(rows.map(row=>Object.freeze({
        customerId:String(row.id||""),
        customerCode:text(row.customer_code,80)||null,
        customerName:text(row.name,160)
      }))),
      authority
    });
  }
  const customer=rows[0],invoiceCap=Math.min(50,Math.max(1,Number(invoiceLimit)||20)),cte=allocationCte();
  const [summary,invoices]=await Promise.all([
    env.DB.prepare(cte+
      "SELECT COUNT(*) outstanding_invoice_count,COALESCE(SUM(outstanding_minor),0) outstanding_minor,"+
      " SUM(CASE WHEN due_on<? THEN 1 ELSE 0 END) overdue_invoice_count,"+
      " COALESCE(SUM(CASE WHEN due_on<? THEN outstanding_minor ELSE 0 END),0) overdue_minor,"+
      " MIN(due_on) earliest_due_on FROM open_invoices WHERE customer_id=?"
    ).bind(tenantId,tenantId,businessDate,businessDate,customer.id).first(),
    env.DB.prepare(cte+
      "SELECT id,invoice_number,issued_on,due_on,total_minor,allocated_minor,outstanding_minor,"+
      " CASE WHEN due_on<? THEN 1 ELSE 0 END overdue"+
      " FROM open_invoices WHERE customer_id=? ORDER BY overdue DESC,due_on ASC,outstanding_minor DESC LIMIT ?"
    ).bind(tenantId,tenantId,businessDate,customer.id,invoiceCap).all()
  ]);
  return Object.freeze({
    state:"resolved",
    currency:"BWP",
    businessDate,
    customer:Object.freeze({
      customerId:String(customer.id||""),
      customerCode:text(customer.customer_code,80)||null,
      customerName:text(customer.name,160)
    }),
    outstandingInvoiceCount:Number(summary?.outstanding_invoice_count||0),
    outstandingMinor:Number(summary?.outstanding_minor||0),
    overdueInvoiceCount:Number(summary?.overdue_invoice_count||0),
    overdueMinor:Number(summary?.overdue_minor||0),
    earliestDueOn:summary?.earliest_due_on||null,
    invoices:Object.freeze((invoices.results||[]).map(row=>Object.freeze({
      id:String(row.id||""),
      invoiceNumber:text(row.invoice_number,80),
      issuedOn:row.issued_on||null,
      dueOn:row.due_on||null,
      totalMinor:Number(row.total_minor||0),
      allocatedMinor:Number(row.allocated_minor||0),
      outstandingMinor:Number(row.outstanding_minor||0),
      overdue:Number(row.overdue||0)===1
    }))),
    authority
  });
}

async function invoiceDetail(env,tenantId,invoiceId){
  return await env.DB.prepare(
    "SELECT i.id,i.customer_id,c.name customer_name,i.invoice_number,i.issued_on,i.due_on,i.description,i.total_minor,i.currency,i.status,i.created_at,"+
    " COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor WHEN a.entry_type='reverse' THEN -a.amount_minor ELSE 0 END),0) allocated_minor"+
    " FROM finance_invoices i"+
    " JOIN finance_customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id"+
    " LEFT JOIN finance_invoice_allocations a ON a.invoice_id=i.id AND a.tenant_id=i.tenant_id"+
    " WHERE i.tenant_id=? AND i.id=?"+
    " GROUP BY i.id,i.customer_id,c.name,i.invoice_number,i.issued_on,i.due_on,i.description,i.total_minor,i.currency,i.status,i.created_at LIMIT 1"
  ).bind(tenantId,invoiceId).first();
}

export async function handleFinanceReceivablesRequest({
  request,url,env,auth,json,readJson,id,appendLineage,writeAudit,sha256Hex
}){
  const path=String(url?.pathname||"");
  if(!path.startsWith("/api/finance/"))return null;

  if(path==="/api/finance/receivables/summary"&&request.method==="GET"){
    return json(await financeReceivablesSummary(env,auth.tenant_id));
  }
  if(path==="/api/finance/collections/today"&&request.method==="GET"){
    return json(await financeDailyCollections(env,auth.tenant_id));
  }
  if(path==="/api/finance/customers"&&request.method==="GET"){
    const rows=await env.DB.prepare(
      "SELECT id,customer_code,name,status,created_at FROM finance_customers WHERE tenant_id=? ORDER BY status,name LIMIT ?"
    ).bind(auth.tenant_id,MAX_RECEIVABLE_LIST).all();
    return json({items:rows.results||[],authority:{canonical:true,providerNeutral:true,source:"finance_customers"}});
  }
  if(path==="/api/finance/customers"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024});
    const name=text(body.name,160),customerCode=text(body.customerCode,80)||null;
    if(name.length<2)return json({error:"customer_name_required"},400);
    const customerId=id();
    try{
      await env.DB.prepare(
        "INSERT INTO finance_customers(id,tenant_id,customer_code,name,status,created_by_user_id) VALUES(?,?,?,?, 'active',?)"
      ).bind(customerId,auth.tenant_id,customerCode,name,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"finance_customer_code_exists"},409);
      throw error;
    }
    await appendLineage({
      env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CUSTOMER_CREATED",
      entityType:"finance_customer",entityId:customerId,payload:{customerCode,name,status:"active"},sha256Hex,id
    });
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_CUSTOMER_CREATED",{customerId,customerCode});
    return json({ok:true,id:customerId,customerCode,name,status:"active"},201);
  }
  if(path==="/api/finance/invoices"&&request.method==="GET"){
    const limit=Math.min(MAX_RECEIVABLE_LIST,Math.max(1,Number(url.searchParams.get("limit")||100)));
    const rows=await env.DB.prepare(
      "SELECT i.id,i.customer_id,c.name customer_name,i.invoice_number,i.issued_on,i.due_on,i.description,i.total_minor,i.currency,i.status,i.created_at,"+
      " COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor WHEN a.entry_type='reverse' THEN -a.amount_minor ELSE 0 END),0) allocated_minor"+
      " FROM finance_invoices i"+
      " JOIN finance_customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id"+
      " LEFT JOIN finance_invoice_allocations a ON a.invoice_id=i.id AND a.tenant_id=i.tenant_id"+
      " WHERE i.tenant_id=?"+
      " GROUP BY i.id,i.customer_id,c.name,i.invoice_number,i.issued_on,i.due_on,i.description,i.total_minor,i.currency,i.status,i.created_at"+
      " ORDER BY i.issued_on DESC,i.created_at DESC LIMIT ?"
    ).bind(auth.tenant_id,limit).all();
    const businessDate=gaboroneBusinessDate();
    const items=(rows.results||[]).map(row=>({
      id:row.id,customerId:row.customer_id,customerName:row.customer_name,invoiceNumber:row.invoice_number,
      issuedOn:row.issued_on,dueOn:row.due_on,description:row.description,totalMinor:Number(row.total_minor||0),
      allocatedMinor:Number(row.allocated_minor||0),
      outstandingMinor:row.status==="void"?0:Math.max(0,Number(row.total_minor||0)-Number(row.allocated_minor||0)),
      currency:row.currency,status:row.status,
      overdue:row.status==="issued"&&row.due_on<businessDate&&Number(row.total_minor||0)>Number(row.allocated_minor||0),
      createdAt:row.created_at
    }));
    return json({
      items,currency:"BWP",businessDate,
      authority:{canonical:true,providerNeutral:true,source:"finance_invoices_plus_transaction_allocations"}
    });
  }
  if(path==="/api/finance/invoices"&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:16*1024});
    const customerId=text(body.customerId,64),invoiceNumber=text(body.invoiceNumber,80);
    const issuedOn=text(body.issuedOn,10),dueOn=text(body.dueOn,10),description=text(body.description,500);
    const totalMinor=integer(body.totalMinor);
    if(!invoiceNumber)return json({error:"invoice_number_required"},400);
    if(!validDate(issuedOn)||!validDate(dueOn)||dueOn<issuedOn)return json({error:"invalid_invoice_dates"},400);
    if(totalMinor===null||totalMinor<=0)return json({error:"invalid_invoice_total_minor"},400);
    const customer=await env.DB.prepare(
      "SELECT id,name FROM finance_customers WHERE id=? AND tenant_id=? AND status='active' LIMIT 1"
    ).bind(customerId,auth.tenant_id).first();
    if(!customer)return json({error:"finance_customer_not_found"},404);
    const invoiceId=id();
    try{
      await env.DB.prepare(
        "INSERT INTO finance_invoices(id,tenant_id,customer_id,invoice_number,issued_on,due_on,description,total_minor,currency,status,created_by_user_id)"+
        " VALUES(?,?,?,?,?,?,?,?, 'BWP','issued',?)"
      ).bind(invoiceId,auth.tenant_id,customerId,invoiceNumber,issuedOn,dueOn,description,totalMinor,auth.user_id).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error)))return json({error:"finance_invoice_exists_or_invalid"},409);
      throw error;
    }
    await appendLineage({
      env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"INVOICE_ISSUED",
      entityType:"finance_invoice",entityId:invoiceId,
      payload:{customerId,invoiceNumber,issuedOn,dueOn,totalMinor,currency:"BWP"},sha256Hex,id
    });
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_INVOICE_ISSUED",{invoiceId,customerId,invoiceNumber,totalMinor,dueOn});
    return json({
      ok:true,id:invoiceId,customerId,customerName:customer.name,invoiceNumber,issuedOn,dueOn,
      totalMinor,outstandingMinor:totalMinor,currency:"BWP",status:"issued"
    },201);
  }

  const allocationRoute=invoiceAllocationPath(path);
  if(allocationRoute&&request.method==="POST"){
    const body=await readJson(request,{maxBytes:8*1024});
    const transactionId=text(body.transactionId,64),amountMinor=integer(body.amountMinor);
    const idempotencyKey=text(request.headers.get("idempotency-key")||body.idempotencyKey,120);
    if(!transactionId)return json({error:"finance_transaction_id_required"},400);
    if(amountMinor===null||amountMinor<=0)return json({error:"invalid_allocation_amount_minor"},400);
    if(idempotencyKey.length<8)return json({error:"idempotency_key_required"},400);
    const invoice=await invoiceDetail(env,auth.tenant_id,allocationRoute.invoiceId);
    if(!invoice||invoice.status!=="issued")return json({error:"finance_invoice_not_allocatable"},404);
    const transaction=await env.DB.prepare(
      "SELECT id,posted_on,amount_minor FROM finance_transactions WHERE id=? AND tenant_id=? AND amount_minor>0 LIMIT 1"
    ).bind(transactionId,auth.tenant_id).first();
    if(!transaction)return json({error:"finance_transaction_not_allocatable"},404);
    const allocationId=(await sha256Hex(JSON.stringify([
      auth.tenant_id,allocationRoute.invoiceId,transactionId,idempotencyKey
    ]))).slice(0,64);
    const existing=await env.DB.prepare(
      "SELECT id,invoice_id,transaction_id,amount_minor,entry_type FROM finance_invoice_allocations WHERE id=? AND tenant_id=? LIMIT 1"
    ).bind(allocationId,auth.tenant_id).first();
    if(existing){
      if(existing.invoice_id!==allocationRoute.invoiceId||existing.transaction_id!==transactionId||
         Number(existing.amount_minor)!==amountMinor||existing.entry_type!=="apply"){
        return json({error:"idempotency_key_conflict"},409);
      }
      return json({
        ok:true,id:allocationId,invoiceId:allocationRoute.invoiceId,transactionId,amountMinor,currency:"BWP",replayed:true
      });
    }
    try{
      await env.DB.prepare(
        "INSERT INTO finance_invoice_allocations(id,tenant_id,invoice_id,transaction_id,amount_minor,entry_type,reverses_allocation_id,created_by_user_id)"+
        " VALUES(?,?,?,?,?,'apply',NULL,?)"
      ).bind(allocationId,auth.tenant_id,allocationRoute.invoiceId,transactionId,amountMinor,auth.user_id).run();
    }catch(error){
      const message=String(error);
      if(message.includes("finance_invoice_overallocation"))return json({error:"finance_invoice_overallocation"},409);
      if(message.includes("finance_transaction_overallocation"))return json({error:"finance_transaction_overallocation"},409);
      if(message.includes("finance_invoice_not_allocatable")||message.includes("finance_transaction_not_allocatable")){
        return json({error:"finance_allocation_scope_invalid"},409);
      }
      throw error;
    }
    await appendLineage({
      env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"INVOICE_PAYMENT_ALLOCATED",
      entityType:"finance_invoice_allocation",entityId:allocationId,
      payload:{
        invoiceId:allocationRoute.invoiceId,transactionId,amountMinor,
        transactionPostedOn:transaction.posted_on,currency:"BWP"
      },sha256Hex,id
    });
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_INVOICE_PAYMENT_ALLOCATED",{
      allocationId,invoiceId:allocationRoute.invoiceId,transactionId,amountMinor
    });
    const updated=await invoiceDetail(env,auth.tenant_id,allocationRoute.invoiceId);
    return json({
      ok:true,id:allocationId,invoiceId:allocationRoute.invoiceId,transactionId,amountMinor,currency:"BWP",
      invoiceOutstandingMinor:Math.max(0,Number(updated?.total_minor||0)-Number(updated?.allocated_minor||0))
    },201);
  }

  const reverseRoute=invoiceAllocationReversePath(path);
  if(reverseRoute&&request.method==="POST"){
    const original=await env.DB.prepare(
      "SELECT id,invoice_id,transaction_id,amount_minor,entry_type FROM finance_invoice_allocations"+
      " WHERE id=? AND tenant_id=? AND invoice_id=? LIMIT 1"
    ).bind(reverseRoute.allocationId,auth.tenant_id,reverseRoute.invoiceId).first();
    if(!original||original.entry_type!=="apply")return json({error:"finance_allocation_not_found"},404);
    const existingReverse=await env.DB.prepare(
      "SELECT id FROM finance_invoice_allocations WHERE tenant_id=? AND reverses_allocation_id=? LIMIT 1"
    ).bind(auth.tenant_id,reverseRoute.allocationId).first();
    if(existingReverse){
      return json({ok:true,id:existingReverse.id,reversesAllocationId:reverseRoute.allocationId,replayed:true});
    }
    const reversalId=(await sha256Hex(JSON.stringify([
      auth.tenant_id,reverseRoute.allocationId,"reverse"
    ]))).slice(0,64);
    try{
      await env.DB.prepare(
        "INSERT INTO finance_invoice_allocations(id,tenant_id,invoice_id,transaction_id,amount_minor,entry_type,reverses_allocation_id,created_by_user_id)"+
        " VALUES(?,?,?,?,?,'reverse',?,?)"
      ).bind(
        reversalId,auth.tenant_id,reverseRoute.invoiceId,original.transaction_id,
        Number(original.amount_minor),reverseRoute.allocationId,auth.user_id
      ).run();
    }catch(error){
      if(/unique|constraint/i.test(String(error))){
        const replay=await env.DB.prepare(
          "SELECT id FROM finance_invoice_allocations WHERE tenant_id=? AND reverses_allocation_id=? LIMIT 1"
        ).bind(auth.tenant_id,reverseRoute.allocationId).first();
        if(replay)return json({ok:true,id:replay.id,reversesAllocationId:reverseRoute.allocationId,replayed:true});
      }
      throw error;
    }
    await appendLineage({
      env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"INVOICE_PAYMENT_ALLOCATION_REVERSED",
      entityType:"finance_invoice_allocation",entityId:reversalId,
      payload:{
        invoiceId:reverseRoute.invoiceId,transactionId:original.transaction_id,
        amountMinor:Number(original.amount_minor),reversesAllocationId:reverseRoute.allocationId,currency:"BWP"
      },sha256Hex,id
    });
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_INVOICE_PAYMENT_ALLOCATION_REVERSED",{
      allocationId:reversalId,reversesAllocationId:reverseRoute.allocationId,
      invoiceId:reverseRoute.invoiceId,transactionId:original.transaction_id,amountMinor:Number(original.amount_minor)
    });
    return json({ok:true,id:reversalId,reversesAllocationId:reverseRoute.allocationId,currency:"BWP"},201);
  }

  const voidRoute=invoiceVoidPath(path);
  if(voidRoute&&request.method==="POST"){
    const invoice=await invoiceDetail(env,auth.tenant_id,voidRoute.invoiceId);
    if(!invoice)return json({error:"finance_invoice_not_found"},404);
    if(invoice.status==="void")return json({ok:true,id:voidRoute.invoiceId,status:"void",replayed:true});
    if(Number(invoice.allocated_minor||0)!==0)return json({error:"finance_invoice_has_active_allocations"},409);
    const result=await env.DB.prepare(
      "UPDATE finance_invoices SET status='void' WHERE id=? AND tenant_id=? AND status='issued'"
    ).bind(voidRoute.invoiceId,auth.tenant_id).run();
    if(Number(result?.meta?.changes||0)!==1)return json({error:"finance_invoice_state_conflict"},409);
    await appendLineage({
      env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"INVOICE_VOIDED",
      entityType:"finance_invoice",entityId:voidRoute.invoiceId,
      payload:{invoiceNumber:invoice.invoice_number,totalMinor:Number(invoice.total_minor),currency:"BWP"},sha256Hex,id
    });
    await writeAudit(env,auth.tenant_id,auth.user_id,"FINANCE_INVOICE_VOIDED",{
      invoiceId:voidRoute.invoiceId,invoiceNumber:invoice.invoice_number,totalMinor:Number(invoice.total_minor)
    });
    return json({ok:true,id:voidRoute.invoiceId,status:"void"});
  }

  return null;
}

export const __financeReceivablesTest=Object.freeze({
  validDate,gaboroneBusinessDate,invoiceAllocationPath,invoiceAllocationReversePath,invoiceVoidPath,MAX_RECEIVABLE_LIST
});
