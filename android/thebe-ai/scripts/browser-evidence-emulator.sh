#!/usr/bin/env bash
# Synthetic Android emulator only. No sign-in and no customer data.
# Evidence of browser capability / foreground UI is NOT proof that the
# production website loaded, TWA origin verification passed, or voice works.
set -euo pipefail

out="${RUNNER_TEMP:-/tmp}/thebe-browser-evidence"
mkdir -p "$out"

# Every device running this browser-based APK needs a handler for HTTPS links.
# This check runs on the emulator and does not modify device settings.
adb shell cmd package resolve-activity --brief \
  -a android.intent.action.VIEW \
  -d 'https://thebedesk.com/app/' > "$out/https-handler.txt" 2>&1 || true
if grep -Eiq 'no activity found|unable to resolve|error:|unknown command' "$out/https-handler.txt" \
   || ! grep -Eq '/|com[.]android[.]internal[.]app[.]ResolverActivity' "$out/https-handler.txt"; then
  printf 'BLOCKED: no confirmed HTTPS browser handler on emulator.\n' >&2
  cat "$out/https-handler.txt" >&2
  exit 1
fi

# Record, but do not assert, the foreground task. Custom Tabs may be owned by
# different installed browser providers, so a fixed package-name assertion
# would wrongly declare compatible tablets unsupported.
adb shell dumpsys activity activities > "$out/activity-state.txt" 2>&1 || true
adb shell dumpsys window windows > "$out/window-state.txt" 2>&1 || true
if command -v timeout >/dev/null 2>&1; then
  timeout 25s adb shell uiautomator dump /sdcard/thebe-qa-window.xml >/dev/null 2>&1 || true
else
  adb shell uiautomator dump /sdcard/thebe-qa-window.xml >/dev/null 2>&1 || true
fi
adb exec-out cat /sdcard/thebe-qa-window.xml > "$out/window.xml" 2>/dev/null || true
adb exec-out screencap -p > "$out/screenshot.png" 2>/dev/null || true

# Fresh emulator only; no user session or payments. Store as runner evidence,
# deliberately NOT uploaded from this check until the visual content is reviewed.
printf 'PASS: emulator resolves an HTTPS handler; foreground/browser evidence captured.\n'
printf 'NOT VERIFIED: webpage content, full-screen TWA origin trust, login, audio, or real tablets.\n'
