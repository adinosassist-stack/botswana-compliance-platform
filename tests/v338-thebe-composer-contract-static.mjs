import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const spatialCss=fs.readFileSync("public/assets/thebe-spatial-dock-v246.css","utf8");

assert.match(source,/attachButton=el\("button","thebe-ai-composer-action thebe-ai-attach","\+"\)/,
  "composer must expose the plus attachment action");
assert.match(source,/attachButton\.setAttribute\("aria-label","Add files"\)/,
  "attachment action must remain accessible");
assert.match(source,/fileInput\.multiple=true/,
  "workspace composer must support multiple selected files");
assert.match(source,/fileInput\.accept="\.pdf,\.docx,\.xlsx,\.txt,\.md,\.csv,\.json,\.png,\.jpg,\.jpeg,\.webp"/,
  "attachment chooser must keep the approved document and image formats");
assert.match(source,/compose\.append\(attachButton,fileInput,composeBody,audioButton,sendButton\)/,
  "composer order must keep plus on the left and mic/send on the right");

assert.match(source,/if\(!shellVisible\(\)\|\|textBusy\)return;/,
  "file staging must stay workspace-only and stop while Thebe is busy");
assert.match(source,/next\.length>3\|\|next\.some\(file=>!file\.size\|\|file\.size>1024\*1024\)/,
  "attachment staging must keep the three-file and 1 MB per-file limits");
assert.match(source,/next\.reduce\(\(sum,file\)=>sum\+file\.size,0\)>2\*1024\*1024/,
  "attachment staging must keep the 2 MB combined limit");

assert.match(source,/const draft=clean\(input\?\.value\|\|"",MAX_QUESTION\)\.length>0\|\|pendingFiles\.length>0/,
  "typed text or an attachment must both count as a sendable draft");
assert.match(source,/sendButton\.hidden=!draft&&!textBusy/,
  "send must appear when text or attachments create a draft");
assert.match(source,/if\(audioButton\)\{audioButton\.hidden=draft\|\|textBusy;audioButton\.disabled=textBusy\}/,
  "mic must show only while the composer is idle and empty");
assert.match(source,/if\(attachButton\)\{attachButton\.hidden=!shellVisible\(\);attachButton\.disabled=textBusy\}/,
  "plus attachment action must stay workspace-only");
assert.match(source,/compose\.addEventListener\("submit"[\s\S]*!clean\(value,MAX_QUESTION\)\.length&&!files\.length/,
  "composer must allow attachment-only sends while preventing empty sends");
assert.match(source,/audioButton\.addEventListener\("click",\(\)=>orbButton\.click\(\)\)/,
  "idle mic action must continue to open the existing Thebe voice path");

assert.match(spatialCss,/#thebeAiDock \[hidden\]\{display:none!important\}/,
  "dock CSS must honor hidden state so mic and send never display together accidentally");

console.log("v338 Thebe composer contract static checks passed");
