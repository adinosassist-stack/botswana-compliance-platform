#!/usr/bin/env bash
# An emulator launch smoke only; it does NOT test real tablet hardware,
# authenticated customer flows, voice accuracy, notification geometry or site TWA verification.
set -euo pipefail

apk="${1:-android/thebe-ai/app/build/outputs/apk/debug/app-debug.apk}"
test -f "$apk"

adb wait-for-device
adb shell getprop sys.boot_completed | tr -d '\r' | grep -Fxq '1'
adb install -r "$apk"

installed="$(adb shell pm path com.thebedesk.ai | tr -d '\r')"
if [[ "$installed" != package:* ]]; then
  printf 'Thebe AI APK did not install\n' >&2
  exit 1
fi

# Clear old AndroidRuntime logs before launching our own debug APK.
adb logcat -c
launch="$(adb shell am start -W -n 'com.thebedesk.ai/com.google.androidbrowserhelper.trusted.LauncherActivity' 2>&1 | tr -d '\r')"
printf '%s\n' "$launch"
if ! printf '%s\n' "$launch" | grep -Fq 'Status: ok'; then
  printf 'Android did not confirm app launch\n' >&2
  exit 1
fi

sleep 6
adb logcat -d -v brief -s AndroidRuntime:E > "${RUNNER_TEMP:-/tmp}/thebe-androidruntime.log" || true
if grep -A 8 'FATAL EXCEPTION' "${RUNNER_TEMP:-/tmp}/thebe-androidruntime.log" | grep -Fq 'Process: com.thebedesk.ai'; then
  printf 'Thebe AI process crashed during emulator launch:\n' >&2
  # The emulator contains no customer accounts. Print the bounded AndroidRuntime
  # exception instead of returning an opaque failure; keep private app data out.
  sed -n '/FATAL EXCEPTION/,+34p' "${RUNNER_TEMP:-/tmp}/thebe-androidruntime.log" | head -n 80 >&2
  exit 1
fi

# A browser may show its address bar because no production signing identity
# has been associated with the website; this is expected, not a TWA parity claim.
printf 'PASS: debug APK installed and Android activity launch accepted (emulator only)\n'
