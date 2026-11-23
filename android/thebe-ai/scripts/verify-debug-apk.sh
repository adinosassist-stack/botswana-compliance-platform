#!/usr/bin/env bash
# Internal QA only. Verification does not approve release signing or distribution.
set -euo pipefail

apk="${1:-android/thebe-ai/app/build/outputs/apk/debug/app-debug.apk}"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ ! -f "$apk" ]]; then
  printf 'Missing debug APK: %s\n' "$apk" >&2
  exit 1
fi
if [[ -z "$sdk_root" ]]; then
  printf 'ANDROID_HOME/ANDROID_SDK_ROOT is required\n' >&2
  exit 1
fi

aapt="$sdk_root/build-tools/36.0.0/aapt"
signer="$sdk_root/build-tools/36.0.0/apksigner"
if [[ ! -x "$aapt" || ! -x "$signer" ]]; then
  printf 'Expected Android 36.0.0 build tools for APK verification\n' >&2
  exit 1
fi

badging="$("$aapt" dump badging "$apk")"
permissions="$("$aapt" dump permissions "$apk")"
printf '%s\n' "$badging" | grep -Fq "package: name='com.thebedesk.ai'"
printf '%s\n' "$badging" | grep -Fq "sdkVersion:'26'"
printf '%s\n' "$badging" | grep -Fq "targetSdkVersion:'36'"
printf '%s\n' "$badging" | grep -Fq "launchable-activity: name='com.google.androidbrowserhelper.trusted.LauncherActivity'"

if printf '%s\n' "$permissions" | grep -Eq "uses-permission: name='android.permission.(RECORD_AUDIO|CAMERA|READ_CONTACTS|READ_SMS|QUERY_ALL_PACKAGES)'"; then
  printf 'Unexpected privileged native permission found in debug APK\n' >&2
  exit 1
fi

"$signer" verify --verbose --min-sdk-version 26 "$apk"
sha256sum "$apk"
printf 'PASS: internal debug package identity, entry activity, restricted native permissions, and signing verified\n'
