# Workspace navigation long-task diagnostic (manual, opt-in)

Use this diagnostic only in an authorized, authenticated test workspace. It adds **no** production runtime code, changes no tenant data, and does not enable regulatory or payment actions.

1. In Chrome DevTools, open **Sources → Snippets**, create a snippet, and paste the contents of `scripts/workspace-longtask-console-probe.js`.
2. Record a Chrome **Performance** trace with screenshots and Web Vitals on a cold login and on warm navigation between dashboard, People, Property, Money, and Compliance.
3. Run the snippet, navigate across those views, then execute `__thebeWorkspaceProfile.stop()` in the console. Capture aggregated duration/count and the Chrome call stacks for long tasks over 50ms. **Do not share session tokens, customer payloads, network bodies, screenshots containing private information, or unredacted URLs.**
4. Repeat on desktop and mobile emulation using representative authorized test data. Identify which view and synchronous stack produced the largest blocking time.
5. Keep issue #1701 open until an actual runtime fix is approved, tested and deployed, followed by authenticated cold/warm production verification.

This probe observes browser long-task entries only. It does not attribute individual function times; use Chrome's performance flame chart for causality. A 0-long-task result is not proof that all navigation is responsive. Never treat this diagnostic PR as the fix itself.
