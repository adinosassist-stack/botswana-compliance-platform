#!/usr/bin/env bash
# Non-invasive local preflight on a tester-owned Android tablet.
# Does not install, launch, sign in, record audio, take screenshots, or upload data.
set -euo pipefail

if ! command -v adb >/dev/null 2>&1; then
  printf 'BLOCKED: Android platform-tools (adb) is required.\n' >&2
  exit 1
fi

if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  printf 'Set ANDROID_SERIAL to the exact tester-approved device ID first.\n' >&2
  printf 'Select your tablet using: adb devices\n' >&2
  exit 2
fi

adb -s "$ANDROID_SERIAL" get-state | grep -Fxq device || {
  printf 'BLOCKED: selected tablet is not authorized/connected.\n' >&2
  exit 3
}

# Report device compatibility without printing serial numbers or user data.
manufacturer="$(adb -s "$ANDROID_SERIAL" shell getprop ro.product.manufacturer | tr -d '\r')"
model="$(adb -s "$ANDROID_SERIAL" shell getprop ro.product.model | tr -d '\r')"
api="$(adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.sdk | tr -d '\r')"
printf 'Device: %s %s | Android API: %s\n' "$manufacturer" "$model" "$api"
if [[ ! "$api" =~ ^[0-9]+$ ]] || (( api < 26 )); then
  printf 'BLOCKED: requires Android 8.0 / API 26 or newer.\n' >&2
  exit 4
fi

# Read-only installation check. Does not display app data or credentials.
if adb -s "$ANDROID_SERIAL" shell pm path com.thebedesk.ai | grep -Fq 'package:'; then
  printf 'Thebe AI package installed: YES (launch/login not verified)\n'
else
  printf 'Thebe AI package installed: NO\n'
fi

# HTTPS browser handling is mandatory for a Trusted Web Activity wrapper.
handler="$(adb -s "$ANDROID_SERIAL" shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d https://thebedesk.com/app/ 2>&1 || true)"
if printf '%s\n' "$handler" | grep -Eiq 'no activity found|unable to resolve|error:|unknown command' ||
   ! printf '%s\n' "$handler" | grep -Eq '/'; then
  printf 'BLOCKED: no confirmed HTTPS browser handler.\n' >&2
  exit 5
fi

printf 'HTTPS browser handler: FOUND (TWA verification not established)\n'
printf 'NEXT: follow the tester-owned manual acceptance checklist; no changes made.\n'
