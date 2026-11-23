# Thebe AI Tablet Edition — physical-device acceptance

**This checklist is a test procedure, not a record of a passing device.** It applies only to a tester-owned device with explicit permission. Internal debug APKs are not production software.

## Preflight (read-only)

1. Install Android platform-tools on the tester workstation.
2. Connect the approved Android tablet with USB debugging allowed.
3. Find the device ID locally with `adb devices`. Do **not** paste device IDs, account details, screenshot contents or auth tokens into GitHub.
4. Run `ANDROID_SERIAL=<approved-device-id> bash android/thebe-ai/scripts/inspect-tablet.sh`.
5. Record manufacturer, model, Android version, browser version, and whether the HTTPS browser handler is present. API below 26 is unsupported. No-install and no-browser cases are explicit blockers.

## Emulator login render evidence boundary

CI's Android API 35 smoke checks visible *public* sign-in markers from a synthetic device and reports **BLOCKED** if web content is absent or an error/chooser is shown. API 26 verifies APK install and launch but not visible web content. This does not replace the physical-tablet requirements below.

## Manual acceptance (separate opt-in)

1. Install the exact, checksum-verified internal debug APK only after device-owner permission. Record SHA-256 APK digest and source commit in private QA evidence.
2. Launch Thebe AI. Verify a working browser / safe Custom Tab fallback. Check that the sign-in page really renders and does not display a blank screen, browser-not-found, crash or endless loading. **An Android `am start` success is not sufficient.**
3. Confirm the app navigates to `https://thebedesk.com/app/` or its legitimate authentication redirect. Do not change origin verification or add guessed fingerprints to production.
4. With a dedicated *synthetic test account* only, test login, logout, session return, account-switching and lack of cross-account data. Never use actual customer data in QA evidence.
5. Check chat typing and message retries, microphone consent/deny, voice interruption, reconnection, failure states and whether voice is actually available. Do not claim native microphone/hotword features that the wrapper does not provide.
6. At 320, 375, 414, 430 and 768 effective CSS pixels, plus portrait/landscape, virtual keyboard open, 200% zoom and Android gesture navigation: check AI Dock, bottom navigation, movable notification bell, full notification text, close button and actions. No clipping, hidden controls or overlap.
7. Verify printing / PDF and file chooser from explicit user gestures. On unsupported browsers, the app must truthfully disclose the limitation rather than silently dropping an action.
8. Test offline/reconnect and browser missing/disabled states. The app must not claim that cloud AI can function offline.
9. Capture minimal, redacted **local** evidence for each case: device class, Android and browser version, app source SHA/APK digest, test result, expected vs actual and defect reference. No secrets, account emails, payment details, voice recordings or customer screenshots.

## Release gates

- Signed test artifact and reproducible build; internal debug signature must never be presented as a release signature.
- Full-screen trusted origin requires a separately approved release signing key and reciprocal Digital Asset Links statement. No placeholder fingerprints.
- Independent `thusico` review on final commit; required CI; separate release approval.
- No Android public distribution, OS/firmware flashing, domain configuration, payments or production database writes in this acceptance batch.
