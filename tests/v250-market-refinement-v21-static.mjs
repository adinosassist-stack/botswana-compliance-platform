import assert from "node:assert/strict";
import fs from "node:fs";
import {runInNewContext} from "node:vm";

const loader=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const script=fs.readFileSync("public/js/market-refinement-v21.js","utf8");
const css=fs.readFileSync("public/assets/market-refinement-v21.css","utf8");
const growth=fs.readFileSync("public/js/market-growth-v20.js","utf8");

assert.match(loader,/market-refinement-v21\.css\?v=20261015a/,"homepage loader must attach v21 refinement CSS");
assert.match(loader,/market-refinement-v21\.js\?v=20261015a/,"homepage loader must attach v21 refinement JS");
assert.ok(loader.indexOf("market-growth-v20.js")<loader.indexOf("market-refinement-v21.js"),"v21 refinement must load after v20 growth copy");
assert.match(script,/Run money, people, work and compliance from one intelligent desk\./,"hero must use the simplified operating-system message");
assert.match(script,/Live in Botswana · Namibia next/,"rollout positioning must preserve Botswana-live and Namibia-next strategy");
assert.match(script,/Built for African businesses/,"market page must carry Africa-scale positioning");
assert.match(script,/An AI operator that understands the page you are on\./,"AI section must communicate contextual workspace behavior");
assert.match(script,/Five plans\. One workspace\./,"pricing copy must remain truthful to the five published tiers");
assert.doesNotMatch(script,/Three plans\. One workspace\./,"pricing refinement must not claim only three plans while additional tiers remain published");
assert.match(script,/cards\.forEach\(\(card,index\)=>/,"pricing refinement must apply progressive disclosure consistently across all published cards");
assert.match(script,/details\.plan-more/,"pricing refinement must use progressive disclosure rather than deleting plan detail");
assert.match(css,/\.plan-more summary/,"progressive-disclosure control must have explicit styling");
assert.match(css,/@media \(max-width:760px\)/,"v21 refinement must include a mobile treatment");


function runLateGrowthWriter(refinementAlreadyApplied){
  const selectors=[];
  const gate={
    dataset:refinementAlreadyApplied?{marketRefinementV21:"21"}:{},
    querySelector(selector){selectors.push(selector);return null}
  };
  const queued=[];
  const document={
    title:"",
    readyState:"complete",
    querySelector(){return null},
    querySelectorAll(){return []},
    getElementById(id){return id==="marketingGate"?gate:null}
  };
  runInNewContext(growth,{
    document,
    window:{},
    setTimeout(callback){queued.push(callback)}
  },{timeout:1000});
  for(const callback of queued)callback();
  return {selectors,gate};
}

const refined=runLateGrowthWriter(true);
assert.deepEqual(refined.selectors,[],"a delayed v20 callback must never rewrite v21 hero/pricing/closing copy");
assert.equal(refined.gate.dataset.marketGrowthV20,"1","legacy growth execution marker must remain available");
const unrefined=runLateGrowthWriter(false);
assert.ok(unrefined.selectors.includes(".hero"),"v20 must still apply a fallback hero if v21 refinement is absent");
assert.match(growth,/marketRefinementV21!=="21"/,"v20 late timers must defer to the v21 refinement marker");

console.log("v250 market refinement v21 static checks passed");
