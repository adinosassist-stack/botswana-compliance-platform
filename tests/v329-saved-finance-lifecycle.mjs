import assert from "node:assert/strict";
import {handleFinanceReceivablesRequest} from "../cloudflare/src/finance-receivables.js";

function createMemoryD1(){
  const customers=new Map();
  const invoices=new Map();
  const allocations=[];

  function invoiceRow(invoice){
    if(!invoice)return null;
    const customer=customers.get(invoice.customer_id);
    if(!customer||customer.tenant_id!==invoice.tenant_id)return null;
    const allocatedMinor=allocations
      .filter(row=>row.tenant_id===invoice.tenant_id&&row.invoice_id===invoice.id)
      .reduce((sum,row)=>sum+(row.entry_type==="apply"?row.amount_minor:-row.amount_minor),0);
    return {
      id:invoice.id,
      customer_id:invoice.customer_id,
      customer_name:customer.name,
      invoice_number:invoice.invoice_number,
      issued_on:invoice.issued_on,
      due_on:invoice.due_on,
      description:invoice.description,
      total_minor:invoice.total_minor,
      currency:invoice.currency,
      status:invoice.status,
      created_at:invoice.created_at,
      allocated_minor:allocatedMinor
    };
  }

  return {
    state:{customers,invoices,allocations},
    prepare(sql){
      return {
        bind(...bindings){
          return {
            async first(){
              if(sql.includes("SELECT id,name FROM finance_customers WHERE id=? AND tenant_id=? AND status='active'")){
                const [customerId,tenantId]=bindings;
                const row=customers.get(customerId);
                return row&&row.tenant_id===tenantId&&row.status==="active"?{id:row.id,name:row.name}:null;
              }
              if(sql.includes("FROM finance_invoices i")&&sql.includes("WHERE i.tenant_id=? AND i.id=?")){
                const [tenantId,invoiceId]=bindings;
                const invoice=invoices.get(invoiceId);
                return invoice&&invoice.tenant_id===tenantId?invoiceRow(invoice):null;
              }
              throw new Error(`unhandled first SQL: ${sql}`);
            },
            async all(){
              if(sql.includes("FROM finance_invoices i")&&sql.includes("WHERE i.tenant_id=?")&&sql.includes("ORDER BY i.issued_on")){
                const [tenantId,limit]=bindings;
                const rows=[...invoices.values()]
                  .filter(row=>row.tenant_id===tenantId)
                  .sort((a,b)=>String(b.issued_on).localeCompare(String(a.issued_on))||String(b.created_at).localeCompare(String(a.created_at)))
                  .slice(0,Number(limit)||100)
                  .map(invoiceRow);
                return {results:rows};
              }
              throw new Error(`unhandled all SQL: ${sql}`);
            },
            async run(){
              if(sql.includes("INSERT INTO finance_customers")){
                const [id,tenantId,customerCode,name,userId]=bindings;
                if([...customers.values()].some(row=>row.tenant_id===tenantId&&row.customer_code&&row.customer_code===customerCode)){
                  throw new Error("unique constraint");
                }
                customers.set(id,{id,tenant_id:tenantId,customer_code:customerCode,name,status:"active",created_by_user_id:userId,created_at:"2026-10-11T10:00:00Z"});
                return {meta:{changes:1}};
              }
              if(sql.includes("INSERT INTO finance_invoices")){
                const [id,tenantId,customerId,invoiceNumber,issuedOn,dueOn,description,totalMinor,userId]=bindings;
                if([...invoices.values()].some(row=>row.tenant_id===tenantId&&row.invoice_number===invoiceNumber)){
                  throw new Error("unique constraint");
                }
                invoices.set(id,{
                  id,tenant_id:tenantId,customer_id:customerId,invoice_number:invoiceNumber,
                  issued_on:issuedOn,due_on:dueOn,description,total_minor:Number(totalMinor),currency:"BWP",status:"issued",
                  created_by_user_id:userId,created_at:"2026-10-11T10:01:00Z"
                });
                return {meta:{changes:1}};
              }
              if(sql.includes("UPDATE finance_invoices SET status='void'")){
                const [invoiceId,tenantId]=bindings;
                const invoice=invoices.get(invoiceId);
                if(!invoice||invoice.tenant_id!==tenantId||invoice.status!=="issued")return {meta:{changes:0}};
                invoice.status="void";
                return {meta:{changes:1}};
              }
              throw new Error(`unhandled run SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
}

const DB=createMemoryD1();
const lineage=[];
const audits=[];
let nextId=0;
const id=()=>`saved-finance-${++nextId}`;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const readJson=async request=>await request.json();
const appendLineage=async event=>{lineage.push(event);};
const writeAudit=async (...args)=>{audits.push(args);};
const sha256Hex=async value=>`hash-${String(value).length}`.padEnd(64,"0").slice(0,64);
const env={DB};

async function call({method,path,auth,body}){
  const request=new Request(`https://thebedesk.test${path}`,{
    method,
    headers:body?{"content-type":"application/json"}:undefined,
    body:body?JSON.stringify(body):undefined
  });
  const url=new URL(request.url);
  const response=await handleFinanceReceivablesRequest({
    request,url,env,auth,json,readJson,id,appendLineage,writeAudit,sha256Hex
  });
  assert.ok(response instanceof Response,`${method} ${path} must be handled`);
  return {response,body:await response.json()};
}

const tenantA={tenant_id:"tenant-a",user_id:"owner-a",role:"owner"};
const tenantB={tenant_id:"tenant-b",user_id:"owner-b",role:"owner"};

const createdCustomer=await call({
  method:"POST",path:"/api/finance/customers",auth:tenantA,
  body:{name:"Saved Finance Customer",customerCode:"SFC-001"}
});
assert.equal(createdCustomer.response.status,201);
assert.equal(createdCustomer.body.id,"saved-finance-1");
assert.equal(DB.state.customers.get(createdCustomer.body.id)?.tenant_id,"tenant-a");

const createdInvoice=await call({
  method:"POST",path:"/api/finance/invoices",auth:tenantA,
  body:{
    customerId:createdCustomer.body.id,invoiceNumber:"INV-SAVED-001",
    issuedOn:"2026-10-01",dueOn:"2026-10-31",description:"Independent saved finance lifecycle",
    totalMinor:275000
  }
});
assert.equal(createdInvoice.response.status,201);
assert.equal(createdInvoice.body.id,"saved-finance-2");
assert.equal(createdInvoice.body.status,"issued");
assert.equal(createdInvoice.body.totalMinor,275000);
assert.equal(DB.state.invoices.get(createdInvoice.body.id)?.status,"issued");

const reloadedA=await call({method:"GET",path:"/api/finance/invoices",auth:tenantA});
assert.equal(reloadedA.response.status,200);
assert.equal(reloadedA.body.items.length,1);
assert.equal(reloadedA.body.items[0].id,createdInvoice.body.id);
assert.equal(reloadedA.body.items[0].invoiceNumber,"INV-SAVED-001");
assert.equal(reloadedA.body.items[0].totalMinor,275000);
assert.equal(reloadedA.body.items[0].status,"issued");
assert.equal(reloadedA.body.items[0].outstandingMinor,275000);
assert.equal(reloadedA.body.authority.canonical,true);

const isolatedRead=await call({method:"GET",path:"/api/finance/invoices",auth:tenantB});
assert.equal(isolatedRead.response.status,200);
assert.deepEqual(isolatedRead.body.items,[],"tenant B must not read tenant A saved invoices");

const isolatedMutation=await call({
  method:"POST",path:`/api/finance/invoices/${createdInvoice.body.id}/void`,auth:tenantB
});
assert.equal(isolatedMutation.response.status,404,"tenant B must not mutate tenant A invoice state");
assert.equal(DB.state.invoices.get(createdInvoice.body.id)?.status,"issued");

const voided=await call({
  method:"POST",path:`/api/finance/invoices/${createdInvoice.body.id}/void`,auth:tenantA
});
assert.equal(voided.response.status,200);
assert.equal(voided.body.status,"void");
assert.equal(DB.state.invoices.get(createdInvoice.body.id)?.status,"void");

const reloadedAfterMutation=await call({method:"GET",path:"/api/finance/invoices",auth:tenantA});
assert.equal(reloadedAfterMutation.body.items.length,1);
assert.equal(reloadedAfterMutation.body.items[0].status,"void","void state must persist across a fresh read");
assert.equal(reloadedAfterMutation.body.items[0].outstandingMinor,0,"void invoices must not present an outstanding balance");

const replayedVoid=await call({
  method:"POST",path:`/api/finance/invoices/${createdInvoice.body.id}/void`,auth:tenantA
});
assert.equal(replayedVoid.response.status,200);
assert.equal(replayedVoid.body.replayed,true,"repeating the terminal state transition must be idempotent");

assert.deepEqual(lineage.map(event=>event.eventType),["CUSTOMER_CREATED","INVOICE_ISSUED","INVOICE_VOIDED"]);
assert.ok(lineage.every(event=>event.tenantId==="tenant-a"));
assert.deepEqual(audits.map(args=>args[3]),["FINANCE_CUSTOMER_CREATED","FINANCE_INVOICE_ISSUED","FINANCE_INVOICE_VOIDED"]);
assert.ok(audits.every(args=>args[1]==="tenant-a"));

console.log("v329 saved finance lifecycle: create, persist, reload, tenant isolation, state transition and replay PASS");
