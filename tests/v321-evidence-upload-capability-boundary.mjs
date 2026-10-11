import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../public/js/components.js", import.meta.url), "utf8");

function makeNode(tag = "div") {
  return {
    tagName: String(tag).toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    dataset: {},
    attrs: {},
    style: {},
    children: [],
    files: [],
    value: "",
    parentElement: null,
    setAttribute(key, value) { this.attrs[key] = String(value); },
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = [...children]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    insertAdjacentElement(_where, child) { this.children.push(child); }
  };
}

const evFile = makeNode("input");
const vaultAddCard = makeNode("div");
const nodes = { evFile, vaultAddCard, appShell: null };
const document = {
  readyState: "complete",
  querySelector(selector) {
    return selector === 'meta[name="bw-runtime-mode"]' ? { content: "production" } : null;
  },
  getElementById(id) { return nodes[id] || null; },
  createElement(tag) {
    const item = makeNode(tag);
    Object.defineProperty(item, "id", {
      get() { return this._id || ""; },
      set(value) { this._id = String(value); if (this._id) nodes[this._id] = this; },
      configurable: true
    });
    return item;
  },
  createTextNode(text) { return { textContent: String(text) }; },
  createDocumentFragment() { return makeNode("fragment"); },
  head: makeNode("head"),
  documentElement: makeNode("html")
};

let notice = "";
let originalAddCalls = 0;
let originalOpenCalls = 0;
const windowObject = {
  document,
  fetch: async () => new Response("{}", { status: 200 }),
  Response,
  Request,
  URL,
  AbortController,
  DOMException,
  location: { href: "https://thebedesk.com/app/", origin: "https://thebedesk.com" },
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  currentWorkspaceRole() { return "reviewer"; },
  syncEvidenceRoleUi() {},
  async addEvidence() { originalAddCalls += 1; return true; },
  openAddEvidence() { originalOpenCalls += 1; return true; },
  notifyUser(message) { notice = message; }
};
windowObject.window = windowObject;

const context = {
  window: windowObject,
  document,
  Node: class {},
  Response,
  Request,
  URL,
  AbortController,
  DOMException,
  console,
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  structuredClone
};
vm.createContext(context);
vm.runInContext(source, context, { filename: "components.js" });

assert.equal(evFile.disabled, true, "production file picker must be disabled when uploads are not explicitly enabled");
assert.equal(evFile.attrs["aria-disabled"], "true");
assert.equal(vaultAddCard.dataset.fileUploads, "disabled");
assert.ok(nodes.evidenceUploadBoundaryNote, "closed upload capability must be explained in the UI");

assert.equal(windowObject.openAddEvidence(), false, "reviewer must not enter a dead-end file evidence flow");
assert.equal(originalOpenCalls, 0);
assert.match(notice, /temporarily unavailable/i);

notice = "";
assert.equal(await windowObject.addEvidence(), false, "reviewer evidence must fail closed while secure uploads are unavailable");
assert.equal(originalAddCalls, 0);
assert.match(notice, /secure file scan and approval path/i);

console.log("v321 evidence upload capability boundary: PASS");
