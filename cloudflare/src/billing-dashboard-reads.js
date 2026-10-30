// Never describe unavailable owner billing evidence as an empty queue or zero KPI.
export function billingDashboardRows(result){
 if(!result||typeof result!=='object'||Array.isArray(result)||('success' in result&&result.success!==true)||result.error||
  !Array.isArray(result.results)||result.results.some(row=>!row||typeof row!=='object'||Array.isArray(row)))
  throw new Error('billing_dashboard_unavailable');
 return result.results;
}

export function billingDashboardAggregate(row,fields){
 if(!row||typeof row!=='object'||Array.isArray(row)||fields.some(field=>
  !Object.hasOwn(row,field)||(row[field]!==null&&
   (typeof row[field]!=='number'||!Number.isSafeInteger(row[field])||row[field]<0))))
  throw new Error('billing_dashboard_unavailable');
 return row;
}
