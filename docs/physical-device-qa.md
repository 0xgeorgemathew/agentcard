# Physical-device QA checklist

NFC behavior can only be validated on a **physical iPhone (7+)** with a
**development build** (not Expo Go, not the simulator). Unit tests cover the JS
contract; this checklist covers the native Core NFC lifecycle.

**Build:** `npx expo prebuild --clean && npx expo run:ios --device` after every
change to `app.json`, entitlements, AIDs, or native deps.

## Setup

- [ ] Physical iPhone (iPhone 7 or newer), unlocked, NFC enabled.
- [ ] Development build installed (not Expo Go).
- [ ] A supported Arx Burner / HaLo card.
- [ ] A wrong ISO-DEP card for contrast (e.g. a payment card).
- [ ] Console visible for `[nfc …]` stage traces (dev build only).

## Functional matrix

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| 1 | Supported card | Tap Connect; present Burner | `scanning` → `reading` → success reveal **after** the sheet dismisses; correct EIP-55 address shown |
| 2 | Wrong ISO-DEP card | Tap Connect; present a payment card | `unsupported-card` error (libhalo SELECT fails) |
| 3 | Cancel before detection | Tap Connect; dismiss the system sheet without tapping a card | silent return to `disconnected` |
| 4 | Native timeout | Tap Connect; do not present a card for 60 s | `timedOut` error |
| 5 | Remove card mid-read | Present card, pull it away during the read | silent cancel (or `connectionFailed`); no hang |
| 6 | Rapid repeated taps | Mash Connect several times | only one session runs; extras ignored (`busy`) |
| 7 | Disconnect then rescan | Connect a card; Disconnect; Connect again | clean re-read; no leaked listener; no "Duplicated registration" |
| 8 | Background/foreground | Background the app mid-scan, return | session invalidated cleanly; recovers without a stuck state |
| 9 | Reduce Motion | Enable Reduce Motion in iOS Settings | success/error feedback still reads (no spatial motion) |

## Build / signing matrix

| # | Build variant | Expected |
| --- | --- | --- |
| 10 | Debug development build | all of the above pass |
| 11 | Release/Hermes build | polyfills intact; `get_pkeys` still derives the address; no Buffer/process/crypto errors |
| 12 | New Architecture build | `react-native-nfc-manager` works on New Arch (it is reported untested upstream — verify explicitly) |
| 13 | Distribution-signed build | NFC entitlement valid under signing; no "Entitlements not supported" rejection |

## Native configuration validation

After `prebuild --clean`, inspect the generated files (do not edit by hand):

- [ ] `ios/AgentCard/Info.plist` → `NFCReaderUsageDescription` set.
- [ ] `ios/AgentCard/Info.plist` → `com.apple.developer.nfc.readersession.iso7816.select-identifiers` lists exactly the 4 AIDs from `app.json`.
- [ ] `ios/AgentCard/Info.plist` → `UIUserInterfaceStyle` reflects `dark`.
- [ ] `ios/AgentCard/AgentCard.entitlements` → `com.apple.developer.nfc.readersession.formats` includes `TAG` (and `NDEF` while `includeNdefEntitlement: true`).

## Lifecycle signal checks (dev console)

Watch the `[nfc nfc-N]` traces for one happy attempt and confirm the order:

```
[nfc nfc-1] init → request → tag-detected → command-start → command-done
            → cancel-requested → session-closed
```

- `session-closed` must appear (the authoritative dismissal). If you ever see
  `[nfc] SessionClosed did not fire within 2000ms; proceeding via fallback.`,
  investigate — that path should be unreachable in normal operation.
- No address, public key, tag id, or APDU payload appears in the logs.
