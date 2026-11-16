import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const proposed = "26774583606";
const retired = "26777723273";
const proposedDisplay = "+267 74 583 606";
const retiredDisplay = "+267 77 723 273";
const publicPages = [
  "public/home.html",
  "public/terms/index.html",
  "public/privacy/index.html",
  "public/data-processing/index.html",
  "public/subprocessors/index.html",
  "public/security/index.html",
  "public/ai-data/index.html"
];
const publicScripts = [
  "public/js/public-marketing-v249.js",
  "public/js/public-market-ux-v250.js",
  "public/js/market-conversion-v11.js"
];
const postdeploy = ".github/workflows/whatsapp-public-postdeploy.yml";

test("all proposed public WhatsApp destinations use one replacement number", () => {
  for (const path of [...publicPages, ...publicScripts]) {
    const source = readFileSync(path, "utf8");
    assert.ok(source.includes(proposed), `${path} must contain proposed WhatsApp number`);
    assert.ok(!source.includes(retired), `${path} must not link old WhatsApp number`);
    assert.ok(!source.includes(retiredDisplay), `${path} must not show old WhatsApp number`);
    assert.ok(!source.includes("wa.me/26777723273"), `${path} must not link old WhatsApp number`);
  }
});

test("public-page legal/support links use the proposed WhatsApp number", () => {
  for (const path of publicPages) {
    const source = readFileSync(path, "utf8");
    assert.ok(source.includes("https://wa.me/" + proposed), `${path} WhatsApp link must be updated`);
  }
  const home = readFileSync("public/home.html", "utf8");
  assert.ok(home.includes(proposedDisplay), "homepage must show the replacement display number");
});

test("public WhatsApp postdeploy check tracks the same proposed number", () => {
  const source = readFileSync(postdeploy, "utf8");
  assert.ok(source.includes("OFFICIAL_WHATSAPP_NUMBER: '26774583606'"), "postdeploy number must match proposed site links");
  assert.ok(source.includes("WhatsApp \\+267 74 583 606"), "postdeploy display assertion must match proposal");
  assert.ok(!source.includes(retired) && !source.includes(retiredDisplay), "postdeploy must not expect retired number");
});
