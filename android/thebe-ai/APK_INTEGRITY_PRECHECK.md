# Thebe AI — internal debug APK integrity preflight

**Local tester instructions only. This is not release approval or evidence that a physical tablet passed.** Do not distribute debug builds to customers or use this procedure to bypass source review, TWA origin verification or device-owner consent.

## Before a tester installs anything

1. Locate the exact GitHub Actions **Thebe AI Android source and debug build** run for the **independently reviewed** source SHA. Confirm that its Android APK build and mandatory repository CI passed. Record the run link and reviewed source SHA privately.
2. Obtain the debug APK only through an approved, private GitHub Actions artifact. Its expected internal filename is `app-debug.apk`; there is no public download flow.
3. From the **trusted exact-run build log** of `Verify debug APK identity, Android signature and permissions`, capture the logged SHA-256 digest. Treat a hash supplied only in the same downloaded archive as insufficient independent provenance. The digest comparison below verifies bytes, *not* the authority of the log or the source commit.
4. Verify the local bytes **before** any device connection or installation:

```bash
node android/thebe-ai/scripts/verify-tablet-apk-integrity.mjs --apk /approved/local/path/app-debug.apk --expected-sha256 <trusted-ci-apk-sha256>
```

The check is local and read-only: no Android device access, accounts, network calls, writes, or file uploads. It rejects a missing, renamed, empty, symlinked, oversized or mismatching file. Use an actual digest from the approved CI run; **never** fabricate a placeholder.

5. Using an approved Android SDK workstation, separately verify the APK package, minimum/target SDK, native permissions and *debug* signature:

```bash
ANDROID_HOME=/path/to/android/sdk bash android/thebe-ai/scripts/verify-debug-apk.sh /approved/local/path/app-debug.apk
```

This existing script checks `com.thebedesk.ai`, SDK 26/36, Android Browser Helper launcher, restricted native permissions and APK signing with Android SDK 36.0.0 build tools. A valid debug signature is **not** a trusted release signature or proof of website Digital Asset Links.

## Physical QA is a separate gate

Only after tablet-owner permission, use the existing **read-only** `inspect-tablet.sh` on the specifically authorized device. Do not install, launch, open Chrome, sign in or grant microphone access automatically. Follow `PHYSICAL_TABLET_ACCEPTANCE.md`, and after PR #2820 is independently approved, use its local 32-check manifest. Each check must reflect an actual supervised observation; emulator results are not substitutes.

Do not place device IDs, login details, screenshots, voice recordings, customer/payment information, APKs or private manifests into a public issue or PR. Keep evidence in an approved private QA location.

**Still blocked:** independent `thusico` approval, current-main CI, real-device acceptance, approved package/release signing, reciprocal Digital Asset Links, and separate distribution authorization. No production deployment, bank/payment activation, D1/R2 write, site configuration change or physical hardware purchase is included.
