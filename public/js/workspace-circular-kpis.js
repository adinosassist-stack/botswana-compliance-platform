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
    else ring.className += " thebe-kpi-ring--unavailable";
    if (color && global.CSS?.supports?.("color", color)) ring.style.setProperty("--ring-color", color);
    if (!valid) ring.setAttribute("data-state", "unavailable");
    else ring.setAttribute("data-state", value === 0 ? "zero" : "measured");
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
  function createRatioKpi({ label, numerator, denominator, detail = "", color } = {}) {
    const valid = Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)
      && numerator >= 0 && denominator > 0 && numerator <= denominator;
    const value = valid ? (numerator / denominator) * 100 : null;
    const context = valid ? numerator.toLocaleString() + " / " + denominator.toLocaleString() : "";
    return createCircularKpi({ label, value, detail: detail || context, color });
  }
  function mountRatioKpi(target, metrics) {
    if (!target || typeof target.replaceChildren !== "function") return false;
    const node = createRatioKpi(metrics);
    if (!node) return false;
    target.replaceChildren(node);
    return true;
  }
  function mountRatioKpiFromElements(target, { label, numeratorElement, denominatorElement, detail = "", color } = {}) {
    const readCount = (element) => {
      if (!element || element.hidden || element.closest?.("[hidden]")) return null;
      const raw = String(element.textContent || "").trim();
      if (!/^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/.test(raw)) return null;
      const number = Number(raw.replaceAll(",", ""));
      return Number.isSafeInteger(number) ? number : null;
    };
    return mountRatioKpi(target, {
      label,
      numerator: readCount(numeratorElement),
      denominator: readCount(denominatorElement),
      detail,
      color
    });
  }
  function mountConfiguredRatios(root = global.document) {
    if (!root || typeof root.querySelectorAll !== "function") return 0;
    let mounted = 0;
    for (const target of root.querySelectorAll("[data-thebe-ratio-label][data-thebe-ratio-numerator][data-thebe-ratio-denominator]")) {
      const numeratorId = target.getAttribute("data-thebe-ratio-numerator");
      const denominatorId = target.getAttribute("data-thebe-ratio-denominator");
      const label = target.getAttribute("data-thebe-ratio-label");
      if (!numeratorId || !denominatorId || !label || !global.document?.getElementById) continue;
      const numeratorElement = global.document.getElementById(numeratorId);
      const denominatorElement = global.document.getElementById(denominatorId);
      if (mountRatioKpiFromElements(target, { label, numeratorElement, denominatorElement })) mounted++;
    }
    return mounted;
  }
  global.ThebeCircularKpi = Object.freeze({ createCircularKpi, createRatioKpi, mountRatioKpi, mountRatioKpiFromElements, mountConfiguredRatios });
})(window);
