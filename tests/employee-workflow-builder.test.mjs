import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmployeeWorkflowDraft, EMPLOYEE_WORKFLOW_TEMPLATES } from "../public/employee-workflow-builder.js";
import { validateEmployeeWorkflow } from "../server/employee-workflow-definitions.js";

test("each People workflow template compiles to a backend-valid draft", () => {
  for (const template of EMPLOYEE_WORKFLOW_TEMPLATES) {
    const draft = buildEmployeeWorkflowDraft({ id: template.id, name: template.label, templateId: template.id });
    assert.deepEqual(validateEmployeeWorkflow(draft), draft);
    assert.equal(draft.effect, "preview");
    assert.equal(draft.trigger, "manual");
  }
});

test("weekly reviewable task proposal compiles to server contract", () => {
  const draft = buildEmployeeWorkflowDraft({ id: "weekly_contracts", name: "Contract review", templateId: "contracts", trigger: "weekly", weekday: 1, effect: "propose_internal_task" });
  assert.deepEqual(validateEmployeeWorkflow(draft), draft);
});

test("builder cannot create payroll execution or messaging actions", () => {
  for (const effect of ["payroll.run", "message.send", "execute_code"]) {
    assert.throws(() => buildEmployeeWorkflowDraft({ id: "x", name: "x", templateId: "payroll", effect }), /invalid_effect/);
  }
});

test("builder rejects invalid templates, schedules and identifiers", () => {
  assert.throws(() => buildEmployeeWorkflowDraft({ id: "x", name: "x", templateId: "unknown" }), /invalid_template/);
  assert.throws(() => buildEmployeeWorkflowDraft({ id: "bad id", name: "x", templateId: "leave" }), /invalid_id/);
  assert.throws(() => buildEmployeeWorkflowDraft({ id: "x", name: "x", templateId: "leave", trigger: "weekly", weekday: 9 }), /invalid_weekday/);
});
