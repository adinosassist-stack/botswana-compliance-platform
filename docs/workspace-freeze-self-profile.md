# Workspace freeze self-profile (no paid browser service)

Issue: #1701. This diagnostic runs in the affected signed-in browser. It does not transmit data, access credentials or change workspace records.

## How to run
1. On a desktop Chrome or Edge browser, sign in to Thebe Desk and open the workspace.
2. Press F12, select **Console**. Paste the script below, then press Enter.
3. Navigate between three slow workspace pages. Wait until each finishes loading.
4. Return to Console and run `thebeFreezeReport()`. Copy only the aggregate timings; do **not** share page content, URLs containing tokens, or personal/company data.
5. Run `thebeFreezeStop()` to remove listeners and stop monitoring. Reloading the page also clears it.

```js
(() => {
  if (typeof window.thebeFreezeStop === "function") window.thebeFreezeStop();
  const longTasks = [];
  const navs = [];
  let lastNav = null;
  const observer = typeof PerformanceObserver === "function"
    ? new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
        }
      }) : null;
  try { observer?.observe({ type: "longtask", buffered: true }); } catch (_) {}
  const click = event => {
    const button = event.target?.closest?.("[data-view]");
    if (!button) return;
    lastNav = { start: performance.now(), longTaskIndex: longTasks.length };
    navs.push(lastNav);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!lastNav || !navs.includes(lastNav)) return;
      lastNav.twoFrameMs = Math.round(performance.now() - lastNav.start);
    }));
  };
  document.addEventListener("click", click, true);
  window.thebeFreezeReport = () => ({
    navigations: navs.length,
    twoFrameMs: navs.map(n => n.twoFrameMs ?? null),
    longTaskCount: longTasks.length,
    longTaskDurationsMs: longTasks.map(t => t.duration),
    maxLongTaskMs: Math.max(0, ...longTasks.map(t => t.duration)),
    totalLongTaskMs: longTasks.reduce((sum, t) => sum + t.duration, 0),
    note: "Two-frame timing measures initial frame scheduling, not complete view readiness. Long tasks are page-wide; use DevTools Performance for function attribution."
  });
  window.thebeFreezeStop = () => {
    observer?.disconnect();
    document.removeEventListener("click", click, true);
    delete window.thebeFreezeReport;
    delete window.thebeFreezeStop;
  };
  console.info("Thebe freeze monitor active. Navigate workspace pages, then run thebeFreezeReport().");
})();
```

## Interpretation
- A high `twoFrameMs` suggests the main thread is not allowing paint promptly after a navigation click.
- Many long tasks or a high `maxLongTaskMs` indicates JavaScript or layout blocks the browser's main thread.
- Low long-task counts with slow view completion suggests lazy hydration or network waiting. Use DevTools Network and Performance to distinguish.
- This is diagnostic only: no credentials, payloads, or URLs are collected, and it does not identify the blocking function.

## Release gate
Do not claim the freeze is fixed based on this script alone. Compare before/after authenticated recordings and check navigation responsiveness under representative data.
