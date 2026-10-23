/* Circular KPI DOM helper. Consumers supply actual values; no synthetic metrics. */
(function (global) {
  "use strict";
  function createCircularKpi({ label, value, detail = "", color } = {}) {
    const doc = global.document;
    if (!doc || typeof label !== "string" || !label.trim()) return null;
    const valid = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
    const root = doc.createElement("div");
    root.className = "thebe-kpi";
    const ring = doc.createElement("div");
    ring.className = "thebe-kpi-ring";
    if (valid) ring.style.setProperty("--ring-value", String(value));
    if (color && global.CSS?.supports?.("color", color)) ring.style.setProperty("--ring-color", color);
    const number = doc.createElement("span");
    number.className = "thebe-kpi-ring__value";
    number.textContent = valid ? Math.round(value) + "%" : "—";
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", label + ": " + (valid ? value + " percent" : "data unavailable"));
    ring.append(number);
    const copy = doc.createElement("div");
    const heading = doc.createElement("div");
    heading.className = "thebe-kpi__label";
    heading.textContent = label;
    copy.append(heading);
    if (detail) {
      const sub = doc.createElement("div");
      sub.className = "thebe-kpi__detail";
      sub.textContent = String(detail);
      copy.append(sub);
    }
    root.append(ring, copy);
    return root;
  }
  global.ThebeCircularKpi = Object.freeze({ createCircularKpi });
})(window);
