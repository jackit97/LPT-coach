---
description: "Build and publish an Android APK for LPT Coach via EAS (Expo)"
agent: agent
---
Build and publish the Android app via EAS Build for this project:

1. Run in a terminal (async/background mode, since EAS builds take several minutes): `cd 'c:\Users\Giacomo\LPT coach\LPT-coach\app'; npx eas-cli build --platform android --profile preview --non-interactive`
2. Do not poll aggressively — wait for terminal notifications or check output periodically instead of assuming completion.
3. Once finished, report back: the EAS build page URL, the APK download link/QR, and whether it succeeded or failed.
4. If it fails, surface the exact error/log link EAS provides so the user can inspect it.
