import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const source=path.join(root,"preview/preview-api.json"),target=path.join(root,"preview/preview-data.js");
const data=JSON.parse(fs.readFileSync(source,"utf8"));if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Preview data must be an object keyed by API path");
fs.writeFileSync(target,`// GENERATED FILE. Source of truth: preview/preview-api.json\n(function(g){g.BW=g.BW||{};g.BW.previewData=Object.freeze(${JSON.stringify(data)});})(window);\n`);console.log(`Generated ${path.relative(root,target)}`);
