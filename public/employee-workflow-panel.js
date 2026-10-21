import { EMPLOYEE_WORKFLOW_TEMPLATES, buildEmployeeWorkflowDraft } from "./employee-workflow-builder.js";

/**
 * Mount into an authenticated People workspace container. No auto-execution.
 * The existing app must supply the mount element and authenticated fetch.
 */
export function mountEmployeeWorkflowBuilder(container, { fetcher = fetch } = {}) {
  if (!container || typeof container.replaceChildren !== "function") throw new TypeError("invalid_container");
  const doc = container.ownerDocument;
  const form = doc.createElement("form");
  const title = doc.createElement("h3"); title.textContent = "Employee AI workflows";
  const notice = doc.createElement("p"); notice.textContent = "Create a reviewable workflow. No payroll, messaging or external actions run automatically.";
  const makeField = (label, input) => {
    const wrapper = doc.createElement("label"); wrapper.textContent = label; wrapper.append(input); return wrapper;
  };
  const name = doc.createElement("input"); name.name = "name"; name.maxLength = 100; name.required = true; name.placeholder = "Workflow name";
  const template = doc.createElement("select"); template.name = "template";
  for (const item of EMPLOYEE_WORKFLOW_TEMPLATES) {
    const option = doc.createElement("option"); option.value = item.id; option.textContent = item.label; template.append(option);
  }
  const trigger = doc.createElement("select"); trigger.name = "trigger";
  for (const value of ["manual", "daily", "weekly"]) {
    const option = doc.createElement("option"); option.value = value; option.textContent = value; trigger.append(option);
  }
  const weekday = doc.createElement("select"); weekday.name = "weekday";
  for (const [index,day] of ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].entries()) {
    const option = doc.createElement("option"); option.value = String(index); option.textContent = day; weekday.append(option);
  }
  const effect = doc.createElement("select"); effect.name = "effect";
  for (const [value,label] of [["preview","Preview only"],["propose_internal_task","Propose internal task for review"]]) {
    const option = doc.createElement("option"); option.value = value; option.textContent = label; effect.append(option);
  }
  const button = doc.createElement("button"); button.type = "submit"; button.textContent = "Save workflow";
  const status = doc.createElement("p"); status.setAttribute("role","status");
  form.append(title,notice,makeField("Name",name),makeField("Template",template),makeField("Schedule",trigger),makeField("Weekly day",weekday),makeField("Action",effect),button,status);
  const updateDay = () => { weekday.disabled = trigger.value !== "weekly"; };
  trigger.addEventListener("change",updateDay); updateDay();
  form.addEventListener("submit",async event => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = "Saving…";
    try {
      const workflow = buildEmployeeWorkflowDraft({
        id: "wf_"+globalThis.crypto.randomUUID().replaceAll("-","").slice(0,24),
        name: name.value, templateId: template.value, trigger: trigger.value,
        weekday: trigger.value === "weekly" ? Number(weekday.value) : undefined,
        effect: effect.value
      });
      const response = await fetcher("/api/employee-workflows",{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({workflow})
      });
      if (!response.ok) throw new Error("save_failed_"+response.status);
      status.textContent = "Workflow saved. No automatic action has been executed.";
    } catch {
      status.textContent = "Unable to save workflow. Check access and try again.";
    } finally { button.disabled = false; }
  });
  container.replaceChildren(form);
  return () => container.replaceChildren();
}
