#!/usr/bin/env node
// Offline, deterministic benchmark evaluator. No API calls or customer data.
import fs from "node:fs";
import path from "node:path";

export function summarizeBenchmark(records) {
  if (!Array.isArray(records) || records.length===0) throw new Error("records_required");
  const byModel=new Map();
  for (const r of records) {
    if (!r || typeof r.model!=="string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(r.model)) throw new Error("invalid_model");
    if (typeof r.taskId!=="string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(r.taskId)) throw new Error("invalid_task");
    if (typeof r.verified!=="boolean" || typeof r.correct!=="boolean" || typeof r.authorized!=="boolean") throw new Error("missing_review_evidence");
    if (!Number.isFinite(r.costUsd) || r.costUsd<0 || !Number.isFinite(r.latencyMs) || r.latencyMs<0) throw new Error("invalid_metrics");
    if (Object.keys(r).some(k=>/prompt|secret|password|customer|email|phone|document|token|payload/i.test(k))) throw new Error("unsafe_field");
    const a=byModel.get(r.model)??{model:r.model,runs:0,verified:0,success:0,violations:0,costUsd:0,latencies:[]};
    a.runs++;
    if(r.verified) a.verified++;
    if(r.verified && r.correct && r.authorized) a.success++;
    if(!r.authorized) a.violations++;
    a.costUsd+=r.costUsd;
    a.latencies.push(r.latencyMs);
    byModel.set(r.model,a);
  }
  return [...byModel.values()].map(a=>{
    const sorted=a.latencies.sort((x,y)=>x-y);
    return {model:a.model,runs:a.runs,verified:a.verified,verifiedSuccess:a.success,authorizationViolations:a.violations,verifiedSuccessRate:a.runs? a.success/a.runs:0,costUsd:Number(a.costUsd.toFixed(6)),costPerVerifiedSuccessUsd:a.success?Number((a.costUsd/a.success).toFixed(6)):null,p95LatencyMs:sorted[Math.ceil(.95*sorted.length)-1],eligibleForReview:a.verified===a.runs && a.violations===0 && a.success/a.runs>=.95};
  });
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  const file=process.argv[2];
  if(!file) {console.error("Usage: node scripts/gemini-argon-benchmark.mjs <sanitized-results.json>");process.exitCode=2;}
  else {
    try {
      const data=JSON.parse(fs.readFileSync(file,"utf8"));
      const output=summarizeBenchmark(data);
      console.log(JSON.stringify({status:"offline_review_only",results:output},null,2));
    } catch(e){console.error(e.message);process.exitCode=1;}
  }
}
