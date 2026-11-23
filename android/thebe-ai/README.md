# Thebe AI — Android tablet foundation

**Status: internal Android prototype. A debug-signed APK was compiled in CI. It is not release-signed, not tested on physical devices, not publicly released, and not deployed as a new production service.**

This is an independent Android Studio project for **Thebe AI Tablet Edition**, initially using a **Trusted Web Activity (TWA)** to reuse the existing authenticated Thebe Desk workspace at `https://thebedesk.com/app/`.

## Why TWA first?

- The browser owns session cookies, user sign-in, permissions, navigation and web security checks. The Android wrapper does not copy credentials, add a JavaScript bridge, or expose native secrets.
- Without reciprocal **Digital Asset Links** verification, the browser will normally use a **Custom Tab with an address bar**, not a verified full-screen TWA. Do not hide verification failures.
- Voice, files, notifications and payments are **only as functional as the existing web application and chosen browser**. Native Android push, background hotword, offline AI and OS-level controls are **not included**.
- The dedicated **Thebe AI One** hardware is a later, separate Android/AOSP target with hardware-dependent testing. This project does not promise generic firmware compatibility.

## Build

1. Open this folder (`android/thebe-ai`) as a project in Android Studio, with **JDK 17**, **Android SDK 36** and **Gradle 9.6.0** (required by Android Gradle Plugin 9.4.0).
2. Sync Gradle and run `app` on a compatible emulator or an Android tablet (Android 8.0 / API 26 or later).
3. Or, on an Android SDK workstation with Gradle installed: `gradle :app:assembleDebug`.
4. An unverified browser provider or absent browser may prevent the app from opening. Confirm the fallback on real devices.
   The emulator smoke now also checks that Android resolves an HTTPS handler and captures synthetic foreground evidence. This does **not** prove the website rendered, that Custom Tabs work on physical hardware, or that Digital Asset Links are verified.
5. **Debug APKs are for internal testing only.** Never distribute a debug build as a production release. No official signed APK/AAB has been generated.

## Full-screen TWA prerequisite — NOT authorized for production yet

A release engineer must approve and control the final application ID `com.thebedesk.ai`, the signing-key lifecycle and SHA-256 signing-certificate fingerprint. After that, separately approve and serve the exact `https://thebedesk.com/.well-known/assetlinks.json` site-to-app statement for:

- `relation`: `delegate_permission/common.handle_all_urls`
- `target.namespace`: `android_app`
- `target.package_name`: approved application ID
- `target.sha256_cert_fingerprints`: **real verified release-signing SHA-256 fingerprint**, never a guessed value

This project already includes the *app-to-site* statement (the reverse declaration) and uses no broad app link intent filters. Revalidate both ends on the actual signed package. Do not add a placeholder fingerprint to the production website.

## Acceptance before anyone calls it an installable product

- CI passes for the exact PR head: `gradle :app:assembleDebug`, `node --test tests/thebe-ai-android-source.test.mjs`, built APK identity/signature inspection, and an Android emulator install/launch smoke. Emulator success is **not** physical-device acceptance.
- Independently reviewed by `thusico`; no approval bypass, main merge or deployment by this PR alone.
- Android tablets at 320/375/414/430 CSS-pixel-equivalent and 768px layouts: portrait, landscape, keyboard, zoom, navigation, login/logout, microphone permission, chat/voice availability and fail-closed error handling.
- Resolve the existing notification/AI Dock overlap and clipping acceptance work on real Android hardware; do not mark tests passed based on browser emulation alone.
- Test authentication return, payments, quotations/PDF printing and file chooser on the real browser. Unsupported features must be disclosed or explicitly handled; do not claim native parity without evidence.
- Establish privacy disclosure, asset-link ownership and a reproducible release signing process before any public distribution.

**No production deployment, D1/R2 migration, subscription activation, payment approval, domain association change, or device procurement is part of this branch.**
