#!/usr/bin/env bash
#
# Install a STANDALONE app on the connected iPhone — it runs with no Metro, no
# terminal, no Wi-Fi link to the Mac.
#
# `bun run ios` builds Debug: the app streams its JavaScript from Metro over the
# network, so it only works while a dev server is running (close the terminal or
# relaunch the app and it breaks). This builds the **Release** configuration
# instead: the JS is bundled INTO the .app, so it is self-contained — survive a
# terminal close, a device relaunch, airplane mode, the lot.
#
# How: build the signed Release .app with `xcodebuild` (the bundle phase bundles
# the JS offline — `RCT_NO_LAUNCH_PACKAGER=true` — so no Metro server is ever
# started), then install + launch it with `devicectl`. We deliberately do NOT
# use `expo run:ios --configuration Release`: its post-build step waits on a
# Metro server that Release never starts and hangs forever.
#
# Trade-off: it's a production-style build — no Fast Refresh, no dev menu, no
# red-screen errors. Use `bun run ios` to iterate on code; use this when you
# want the app to run on its own. The build is incremental after the first run
# (reuses DerivedData), but the first build can take a few minutes.

set -euo pipefail

# George's iPhone — same classic hardware UDID the `ios` script in package.json
# uses (xcodebuild -destination and devicectl both accept it). Keep in sync.
DEVICE_UDID="00008140-000839440AE8401C"
BUNDLE_ID="com.arx.nfcreader"
DEVELOPMENT_TEAM="4MJYY5KQPP"
BUILD_LOG="/tmp/arx-release-build.log"

cd "$(dirname "$0")/.."

# ── 1. Build the signed Release .app (JS embedded, no Metro) ──────────────
echo "▶ Building standalone (Release) app for device ${DEVICE_UDID}…"
# No -derivedDataPath: use Xcode's default DerivedData so this stays incremental
# and lands where the glob below expects.
RCT_NO_LAUNCH_PACKAGER=true \
  xcrun xcodebuild \
    -workspace ios/AgentCard.xcworkspace \
    -scheme AgentCard \
    -configuration Release \
    -destination "id=${DEVICE_UDID}" \
    COCOAPODS_PARALLEL_CODE_SIGN=true \
    COMPILER_INDEX_STORE_ENABLE=NO \
    "DEVELOPMENT_TEAM=${DEVELOPMENT_TEAM}" \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    build >"$BUILD_LOG" 2>&1 || {
      echo "✘ Release build failed. Last 30 lines of $BUILD_LOG:" >&2
      tail -30 "$BUILD_LOG" >&2
      exit 1
    }
echo "✔ Build succeeded (log: $BUILD_LOG)"

# ── 2. Locate the built .app and confirm the JS is embedded ───────────────
APP_PATH="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/AgentCard-*/Build/Products/Release-iphoneos/AgentCard.app 2>/dev/null | head -1)"
if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "✘ No Release AgentCard.app found in DerivedData." >&2
  exit 1
fi
if [[ ! -f "$APP_PATH/main.jsbundle" ]]; then
  echo "✘ $APP_PATH has no main.jsbundle — the app would still need Metro. Aborting." >&2
  exit 1
fi
echo "✔ App: $APP_PATH (JS embedded)"

# ── 3. Install + launch via devicectl ─────────────────────────────────────
echo "▶ Installing on device ${DEVICE_UDID}…"
xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH"
echo "▶ Launching ${BUNDLE_ID}…"
xcrun devicectl device process launch --device "$DEVICE_UDID" "$BUNDLE_ID"

echo "✔ Standalone app installed and launched."
echo "  No Metro is running — safe to close this terminal. The app will survive relaunch."
