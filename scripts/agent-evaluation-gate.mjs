import {runAgentEvaluationSuite} from "../cloudflare/src/agent-evaluation.js";

const report=runAgentEvaluationSuite();
if(!report.pass){
  const failed=report.results.filter(item=>!item.pass).map(item=>({
    id:item.id,
    expected:item.expect,
    actual:{allowed:item.actual?.allowed,executionAllowed:item.actual?.executionAllowed,code:item.actual?.code}
  }));
  console.error(JSON.stringify({
    gate:"agent-evaluation",
    suiteVersion:report.suiteVersion,
    total:report.total,
    failed:report.failed,
    falseAllows:report.falseAllows,
    executionEscapes:report.executionEscapes,
    scenarios:failed
  },null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  gate:"agent-evaluation",
  suiteVersion:report.suiteVersion,
  total:report.total,
  passed:report.passed,
  falseAllows:report.falseAllows,
  executionEscapes:report.executionEscapes,
  status:"PASS"
}));
