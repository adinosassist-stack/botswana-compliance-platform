# Thebe AI — software-first Android / AI One program
Date: 23 November 2026

## Decision

Build **Thebe AI Tablet Edition** for compatible existing Android tablets before attempting a new operating system or producing the dedicated compact **Thebe AI One** device. Reuse the authenticated Thebe Desk web platform and existing voice/AI Dock through a browser-based TWA initially; avoid a second login system, parallel tenant database or unreviewed payment bridge.

This PR delivers only a native Android **packaging scaffold** for a TWA browser container plus a PR-scoped debug build/test workflow. It is not a completed voice-native tablet app, ready-to-install APK, production change, device operating system or physical prototype.

## Release tracks

1. **Android tablet prototype:** source review, compile debug APK, test browser provider + sign-in on real Samsung and other tablets. Confirm voice and file permissions are mediated by the browser. Do not assume browser feature parity.
2. **Tablet acceptance:** verified device dimensions, landscape and keyboard; Thebe AI Dock notification collision and PDF/quotations; audio/voice, logout and low connectivity; no false state. Existing production and independent release gates are separate.
3. **Verified TWA installability:** finalize package ID and owner-controlled release signing; approve and publish exact reciprocal Digital Asset Links `/.well-known/assetlinks.json`; verify full screen and safe fallback; prepare privacy, AAB and release QA. No placeholder signing digest.
4. **Thebe AI One dedicated device:** hardware/board and display selection; OEM Android support/BSP proof; bootloader and updates; device-owner or kiosk policy; secure boot, encryption, microphone/audio/speaker, thermal/battery and OTA acceptance. Small-screen design is a distinct responsive UX, not a resized tablet.
5. **Optional native features later:** only after approved scoping for on-device voice, notifications, offline capability, native media, Bluetooth or keyboard. Preserve server-side AI authority and user approvals.

## Do not silently add

- Native assistant APIs, hidden always-on microphones, unconsented recordings or background hotword services.
- A second tenant session, client-held service token, WebView JavaScript interface, payment credential handling, or offline-authoritative business records.
- Device management or firmware for arbitrary existing tablets. OEM-dependent hardware image work is not a universal installable APK.
- Android domain association, release signing material, production deploy, DB migration, payment activation or customer writes without their separate approvals.

## Required review and proof

Use source base SHA from the PR, focused static test and Android debug build. Obtain independent `thusico` review on final head; use repository required checks; report device-specific acceptance separately. No approval is implied by merging the source scaffold.
