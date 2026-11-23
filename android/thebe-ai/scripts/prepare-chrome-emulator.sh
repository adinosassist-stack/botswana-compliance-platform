#!/usr/bin/env bash
# Synthetic Android API 35 Google APIs CI emulator ONLY. Not a device feature.
# Disable Chrome's first-run UI for one disposable test session so the
# authenticated site is not falsely declared "not rendered" behind onboarding.
# NEVER use this on a physical tablet or production Chrome installation.
set -euo pipefail

if [[ "${THEBE_ANDROID_SYNTHETIC_EMULATOR:-}" != "1" ]]; then
  printf 'BLOCKED: synthetic CI emulator opt-in is missing.\n' >&2
  exit 2
fi

serial="$(adb get-serialno | tr -d '\r')"
qemu="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
if [[ "$serial" != emulator-* || "$qemu" != "1" || "$api" != "35" ]]; then
  printf 'BLOCKED: Chrome test-only preparation is prohibited on non-API35 emulators or real devices.\n' >&2
  exit 2
fi
if ! adb shell pm path com.android.chrome | grep -Fq 'package:'; then
  printf 'BLOCKED: Chrome is absent from the disposable emulator.\n' >&2
  exit 1
fi

# Chromium's disable-fre switch is for automated testing.
# Do not disable Digital Asset Links, disable certificate verification, or
# grant native app permissions. Chrome's first-run choices on customer
# tablets MUST remain controlled by their users.
adb shell pm clear com.android.chrome >/dev/null
adb shell am set-debug-app --persistent com.android.chrome >/dev/null
adb shell 'printf "%s\n" "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am force-stop com.android.chrome
printf 'PASS: disposable API 35 emulator Chrome prepared for public sign-in rendering test.\n'
