export const FINANCE_EXCEPTION_DETECTOR_VERSION="2026-09-25.v1";
const n=v=>Number.isFinite(Number(v))?Number(v):0;
export function detectFinanceExceptions(snapshot={}){
 const out=[];
 if(n(snapshot.reconciliationExceptionCount)>0)out.push({key:"reconciliation_exceptions",severity:"high",count:n(snapshot.reconciliationExceptionCount),exposureMinor:n(snapshot.reconciliationExceptionExposureMinor)});
 if(n(snapshot.overdueInvoiceCount)>0)out.push({key:"overdue_receivables",severity:"high",count:n(snapshot.overdueInvoiceCount),exposureMinor:n(snapshot.receivablesOverdueMinor)});
 if(n(snapshot.failedImportBatchCount)>0)out.push({key:"failed_imports",severity:"medium",count:n(snapshot.failedImportBatchCount),exposureMinor:0});
 if(n(snapshot.missingSourceFingerprintCount)>0)out.push({key:"missing_provenance",severity:"high",count:n(snapshot.missingSourceFingerprintCount),exposureMinor:0});
 return Object.freeze(out.map(Object.freeze));
}