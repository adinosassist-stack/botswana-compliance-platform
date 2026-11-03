import test from "node:test";
import assert from "node:assert/strict";
import {renderAgentSimulationPreview} from "../public/js/agent-simulation-preview.js";
test("renderer fails closed without browser DOM",()=>{assert.equal(renderAgentSimulationPreview({replaceChildren(){}},{ok:true}),false);});
test("renderer does not create API or execution capabilities",async()=>{const {readFileSync}=await import("node:fs");const source=readFileSync(new URL("../public/js/agent-simulation-preview.js",import.meta.url),"utf8");assert.doesNotMatch(source,/\bfetch\s*\(|\bapiJson\s*\(|\beval\s*\(|\binnerHTML\b|\blocalStorage\b/);});
