import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../public/js/components.js", import.meta.url), "utf8");

function createNode(tag = "div") {
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
    querySelector() { return null; }
  };
}

function createDocument(extraNodes = {}) {
  const nodes = { appShell: null, ...extraNodes };
  return {
    readyState: "complete",
    querySelector(selector) {
      return selector === 'meta[name="bw-runtime-mode"]' ? { content: "production" } : null;
    },
    getElementById(id) { return nodes[id] || null; },
    createElement(tag) { return createNode(tag); },
    createTextNode(text) { return { textContent: String(text) }; },
    createDocumentFragment() { return createNode("fragment"); },
    head: createNode("head"),
    documentElement: createNode("html")
  };
}

function evaluateComponents({ document, fetchImpl, windowPatch = {} }) {
  const windowObject = {
    document,
    fetch: fetchImpl,
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
    ...windowPatch
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
  return windowObject;
}

{
  let calls = 0;
  const document = createDocument();
  const windowObject = evaluateComponents({
    document,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(JSON.stringify({ error: "idempotency_request_in_progress" }), {
          status: 425,
          headers: { "content-type": "application/json", "retry-after": "0" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const response = await windowObject.fetch("/api/ai/advisor", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "same-key" },
    body: "{}"
  });
  assert.equal(response.status, 200, "advisor request should recover the original result");
  assert.equal(calls, 3, "advisor recovery should retry the same in-progress request");
}

{
  const employeesList = createNode();
  const employeesGaps = createNode();
  let creditRefreshes = 0;
  const document = createDocument({ employeesList, employeesGaps });
  const windowObject = evaluateComponents({
    document,
    fetchImpl: async () => new Response("{}", { status: 200 }),
    windowPatch: {
      renderEmployees() {
        employeesGaps.textContent = "3";
        employeesList.replaceChildren({ textContent: "Verified" });
      },
      async askAiAdvisor() { throw new Error("credit denied"); },
      async renderAiCredits() { creditRefreshes += 1; }
    }
  });

  windowObject.renderEmployees();
  assert.equal(employeesGaps.textContent, "—", "employment evidence gaps must not be guessed");
  assert.equal(employeesList.children.length, 3);
  assert.deepEqual(
    employeesList.children.map((row) => row.children[1].textContent),
    ["Evidence review required", "Evidence review required", "Evidence review required"],
    "employment assurance must not hard-code Verified status"
  );

  await assert.rejects(() => windowObject.askAiAdvisor(), /credit denied/);
  assert.equal(creditRefreshes, 1, "AI wallet must refresh after a failed advisor request");
}

console.log("v319 reviewer P1 truth/AI recovery regression: PASS");
