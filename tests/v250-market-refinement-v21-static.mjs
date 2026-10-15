import assert from "node:assert/strict";
import fs from "node:fs";

const loader=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const script=fs.readFileSync("public/js/market-refinement-v21.js","utf8");
const css=fs.readFileSync("public/assets/market-refinement-v21.css","utf8");

assert.match(loader,/market-refinement-v21\.css\?v=20261015a/,"homepage loader must attach v21 refinement CSS");
assert.match(loader,/market-refinement-v21\.js\?v=20261015a/,"homepage loader must attach v21 refinement JS");
assert.ok(loader.indexOf("market-growth-v20.js")<loader.indexOf("market-refinement-v21.js"),"v21 refinement must load after v20 growth copy");
assert.match(script,/Run money, people, work and compliance from one intelligent desk\./,"hero must use the simplified operating-system message");
assert.match(script,/Live in Botswana · Namibia next/,"rollout positioning must preserve Botswana-live and Namibia-next strategy");
assert.match(script,/Built for African businesses/,"market page must carry Africa-scale positioning");
assert.match(script,/An AI operator that understands the page you are on\./,"AI section must communicate contextual workspace behavior");
assert.match(script,/Three plans\. One workspace\./,"pricing must communicate a simplified three-plan hierarchy");
assert.match(script,/details\.plan-more/,"pricing refinement must use progressive disclosure rather than deleting plan detail");
assert.match(css,/\.plan-more summary/,"progressive-disclosure control must have explicit styling");
assert.match(css,/@media \(max-width:760px\)/,"v21 refinement must include a mobile treatment");

console.log("v250 market refinement v21 static checks passed");
