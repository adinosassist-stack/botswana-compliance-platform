import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../public/js/components.js", import.meta.url), "utf8");

function makeNode(tag = "div") {
  return {
    tagName: String(tag).toUpperCase(),
    className: "",
    textContent: "",
    dataset: {},
    children: [],
    attrs: {},
    style: {},
    setAttribute(key, value) { this.attrs[key] = String(value); },
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = [...children]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const button = makeNode("button");
button.attrs["data-bw-onclick"] = "generateDoc('Employment contract')";
const note = makeNode("div");
note.className = "muted small";
note.textContent = "Profile-aware controlled template";
const card = makeNode("div");
card.className = "card";
card.querySelector = (selector) => selector === ".muted.small" ? note : null;
const grid = makeNode("div");
grid.querySelectorAll = (selector) => {
  if (selector.startsWith("button")) return [button];
  if (selector === ".card") return [card];
  return [];
};

const nodes = { docGrid: grid, appShell: null };
const document = {
  readyState: "complete",
  querySelector(selector) {
    return selector === 'meta[name="bw-runtime-mode"]' ? { content: "production" } : null;
  },
  getElementById(id) { return nodes[id] || null; },
  createElement(tag) { return makeNode(tag); },
  createTextNode(text) { return { textContent: String(text) }; },
  createDocumentFragment() { return makeNode("fragment"); },
  head: makeNode("head"),
  documentElement: makeNode("html")
};

let notice = "";
let event = "";
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
  renderDocs() {},
  generateDoc() { throw new Error("placeholder generator must be replaced"); },
  notifyUser(message) { notice = message; },
  logEvent(name) { event = name; }
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

windowObject.renderDocs();
assert.equal(button.disabled, true, "generate button must be disabled while generation is unqualified");
assert.equal(button.textContent, "Draft generation unavailable");
assert.match(note.textContent, /generation not enabled/i);
assert.equal(grid.dataset.documentGeneration, "disabled");

assert.equal(windowObject.generateDoc("Employment contract"), false);
assert.match(notice, /not available in this release/i);
assert.match(notice, /No document or background workflow has been created/i);
assert.equal(event, "DOCUMENT_DRAFT_UNAVAILABLE");

console.log("v320 document generation capability boundary: PASS");
