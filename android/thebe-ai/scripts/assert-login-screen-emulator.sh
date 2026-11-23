#!/usr/bin/env bash
# API 35 synthetic emulator. This script does not sign in, manipulate
# customer accounts or upload UI images. If accessibility is unavailable,
# it reports BLOCKED rather than treating a launched activity as page proof.
set -euo pipefail

out="${RUNNER_TEMP:-/tmp}/thebe-browser-evidence"
mkdir -p "$out"
xml="$out/unauthenticated-login-ui.xml"

for attempt in 1 2 3 4; do
  if timeout 20s adb shell uiautomator dump /sdcard/thebe-unauthenticated-login-ui.xml >/dev/null 2>&1 &&
     adb exec-out cat /sdcard/thebe-unauthenticated-login-ui.xml > "$xml" 2>/dev/null &&
     node android/thebe-ai/scripts/check-login-ui.mjs "$xml"; then
    # Keep synthetic UI evidence only on the CI runner, never an artifact.
    exit 0
  fi
  if [[ "$attempt" -ne 4 ]]; then sleep 4; fi
done

printf 'BLOCKED: no verified accessible Thebe Desk sign-in content on the API 35 emulator.\n' >&2
printf 'This may be a browser provider, network, page-loading or accessibility issue; do not claim render acceptance.\n' >&2
exit 1
