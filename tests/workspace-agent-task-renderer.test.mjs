import test from "node:test";
import assert from "node:assert/strict";
import { renderWorkspaceAgentTasks } from "../public/js/workspace-agent-task-renderer.js";

test("renderer never touches DOM for invalid identity or snapshot", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock",
    dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("unexpected DOM access"); }
  };
  assert.equal(renderWorkspaceAgentTasks({ dock, snapshot: { ok: false, tasks: [] }, identity: { tenantId: "t", userId: "u", workspace: "finance" } }).ok, false);
  assert.equal(renderWorkspaceAgentTasks({ dock, snapshot: { ok: true, tasks: [] }, identity: { tenantId: "t", workspace: "finance" } }).ok, false);
  assert.equal(touched, 0);
});

test("renderer refuses mixed-tenant snapshot before touching DOM", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock",
    dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("unexpected DOM access"); }
  };
  const identity = { tenantId: "tenant-a", userId: "user-a", workspace: "finance" };
  const snapshot = { ok: true, tasks: [
    { id: "one", tenantId: "tenant-a", userId: "user-a", workspace: "finance", state: "queued" },
    { id: "two", tenantId: "tenant-b", userId: "user-a", workspace: "finance", state: "queued" }
  ] };
  assert.equal(renderWorkspaceAgentTasks({ dock, identity, snapshot }).code, "task_scope_mismatch");
  assert.equal(touched, 0);
});

test("renderer displays canonical task state and review requirement", () => {
  const originalDocument = globalThis.document;
  const elements = [];
  const element = tag => ({
    tag, dataset: {}, children: [], textContent: "",
    setAttribute() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; }
  });
  globalThis.document = { createElement: tag => { const node = element(tag); elements.push(node); return node; } };
  try {
    const dock = {
      id: "thebeAiDock", dataset: { surface: "workspace" },
      querySelector: () => null, append(node) { this.panel = node; }
    };
    const identity = { tenantId: "t", userId: "u", workspace: "finance" };
    const snapshot = { ok: true, tasks: [{
      id: "task", tenantId: "t", userId: "u", workspace: "finance",
      title: "Review reconciliation", state: "queued", approvalRequired: true,
      executionAllowed: false, externalSideEffects: false, authority: "recommendation_only"
    }] };
    assert.equal(renderWorkspaceAgentTasks({ dock, identity, snapshot }).count, 1);
    assert.ok(elements.some(node => node.tag === "small" && node.textContent === "Queued · Review required"));
  } finally { globalThis.document = originalDocument; }
});

test("renderer fails closed for unmounted dock without dataset", () => {
  let touched = 0;
  const dock = { id: "thebeAiDock", querySelector: () => { touched++; } };
  const result = renderWorkspaceAgentTasks({
    dock, identity: { tenantId: "t", userId: "u", workspace: "owner" },
    snapshot: { ok: true, tasks: [] }
  });
  assert.equal(result.code, "workspace_dock_required");
  assert.equal(touched, 0);
});

test("renderer rejects unsafe advisory snapshot before DOM mutation", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock", dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("DOM access forbidden"); }
  };
  const identity = { tenantId: "t", userId: "u", workspace: "finance" };
  const base = {
    id: "task", tenantId: "t", userId: "u", workspace: "finance",
    title: "Review", state: "queued", approvalRequired: true,
    executionAllowed: false, externalSideEffects: false, authority: "recommendation_only"
  };
  for (const unsafe of [
    { ...base, executionAllowed: true },
    { ...base, approvalRequired: false },
    { ...base, externalSideEffects: true },
    { ...base, authority: "execute" },
    { ...base, state: "completed" },
    { ...base, state: "unexpected" },
    { ...base, id: "" },
    { ...base, title: null }
  ]) {
    assert.equal(renderWorkspaceAgentTasks({ dock, identity, snapshot: { ok: true, tasks: [unsafe] } }).code, "unsafe_task_snapshot");
  }
  assert.equal(renderWorkspaceAgentTasks({ dock, identity, snapshot: { ok: true, tasks: Array(7).fill(base) } }).code, "unsafe_task_snapshot");
  assert.equal(touched, 0);
});

test("renderer rejects duplicate task identifiers without touching DOM", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock", dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("DOM must remain untouched"); }
  };
  const identity = { tenantId: "t", userId: "u", workspace: "finance" };
  const task = {
    id: "same", title: "Review", tenantId: "t", userId: "u", workspace: "finance",
    state: "queued", approvalRequired: true, executionAllowed: false,
    externalSideEffects: false, authority: "recommendation_only"
  };
  const result = renderWorkspaceAgentTasks({ dock, identity, snapshot: { ok: true, tasks: [task, { ...task }] } });
  assert.equal(result.code, "duplicate_task_ids");
  assert.equal(touched, 0);
});
