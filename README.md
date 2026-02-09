# AgentCard

An Expo + React Native app that reads the primary Ethereum address off an **Arx
Burner / HaLo** NFC card by sending the libhalo `get_pkeys` command over an
ISO-DEP (ISO 14443-4) session. The address is derived on-card and returned by
libhalo (secp256k1 → keccak256 → EIP-55); this app presents it.

> ⚠️ **Physical iOS device + development build required.** NFC cannot run in
> Expo Go or the iOS simulator. See [Development build](#development-build).

---

## Supported versions (tested matrix)

| Layer | Version |
| --- | --- |
| Expo SDK | `57.0.4` (declared `~57.0.1`) |
| React Native | `0.86.0` (pinned exact) |
| React | `19.2.3` |
| `@arx-research/libhalo` | `1.20.0` resolved (declared `^1.19.0`) |
| `react-native-nfc-manager` | `3.17.2` (declared `^3.17.2`) |
| iOS deployment target | `16.4` |
| Toolchain | bun `1.3.13`, TypeScript `~6.0.3`, Vitest `^4.1.10` |

The crypto/APDU boundary is version-sensitive. See
[Dependency & version policy](#dependency--version-policy).

---

## Development build

libhalo depends on `react-native-nfc-manager`, a native module. Expo Go cannot
load native code that isn't already in the Go binary, and the iOS simulator has
no NFC hardware. You must build a custom development client onto a physical
iPhone (iPhone 7 or newer).

```bash
bun install
# Generate/sync the native iOS project from app.json (CNG), then build onto the device:
npx expo run:ios --device
```

The first run performs prebuild (generates `ios/`) and a native Xcode build. Any
change to `app.json` plugins, entitlements, AIDs, or a native dependency
**requires re-running prebuild + a native rebuild** — a JS-only `expo start`
refresh is not enough. `expo-router`/JS changes hot-reload normally.

### Why Expo Go and the simulator can't test this

- **Expo Go** ships a fixed set of native modules; `react-native-nfc-manager` is
  not among them, so `NfcManager.start()` / `requestTechnology()` are unavailable.
- **iOS simulator** has no Core NFC hardware and no `NFCTagReaderSession`.
- The SessionClosed dismissal contract (below) is an iOS Core NFC behavior that
  can only be validated on a real device with a real card.

---

## app.json / config-plugin / CNG ownership

This project uses Continuous Native Generation: **`app.json` (with config
plugins) is the source of truth** for native configuration. The `ios/` directory
is generated and `.gitignore`d. Do not hand-edit files under `ios/`; change
`app.json` and regenerate.

The NFC config plugin (`react-native-nfc-manager`) writes, from `app.json`:

- `NFCReaderUsageDescription` ← `nfcPermission`
- `com.apple.developer.nfc.readersession.iso7816.select-identifiers` ← `selectIdentifiers`
- `com.apple.developer.nfc.readersession.felica.systemcodes` ← `systemCodes`
- `com.apple.developer.nfc.readersession.formats` ← `includeNdefEntitlement`
  (`true` → `["NDEF","TAG"]`, `false` → `["TAG"]`)

### NFC permission, entitlement, and AID configuration

Current config:

```json
[
  "react-native-nfc-manager",
  {
    "nfcPermission": "Scan your Arx Burner or HaLo card to read its Ethereum address.",
    "selectIdentifiers": [
      "A0000009490148614C6F",
      "481199130E9F01",
      "D2760000850101",
      "D2760000850100"
    ],
    "systemCodes": [],
    "includeNdefEntitlement": true
  }
]
```

- `A0000009490148614C6F` — HaLo applet AID (vendor prefix `A000000949` + `01` + "HaLo").
- `481199130E9F01` — Arx Burner applet AID.
- `D2760000850101` — NFC Forum NDEF Application AID. libhalo's official Expo
  guide lists it; it widens iOS card detection for HaLo generations that lead
  with their NDEF application. **Kept intentionally** to match upstream libhalo
  guidance rather than risk breaking a card generation that simulator/unit tests
  cannot detect (see ADR-0003).
- `D2760000850100` — NFC Forum NDEF Type-2 Tag AID. Widens iOS detection for
  NDEF-led cards; mirrored from the prior hand-edited native `Info.plist` so the
  rename's `prebuild --clean` preserves on-device detection behavior.
- `includeNdefEntitlement: true` is kept per the libhalo guide. `get_pkeys` only
  needs the `TAG` format (IsoDep), so this is mildly broader than strictly
  required; the tradeoff is documented in ADR-0003.

iOS uses `select-identifiers` as a **filter**: a tag is presented to the reader
session only if it advertises one of the listed AIDs, so the HaLo AIDs must
remain present for the Burner to be detected.

> **Dark mode:** `app.json` declares `userInterfaceStyle: "dark"` and the splash
> `backgroundColor` is `#0A0B0F`; both are reflected into the generated
> `ios/AgentCard/Info.plist` and splash colorset by `npx expo prebuild --clean`.

---

## Polyfill load order

libhalo → ethers → `@noble/curves` read `Buffer`, `process`, `crypto`, `self`
at module-evaluation time, none of which exist in Hermes by default. The polyfill
bundle **must install before expo-router loads the route tree** (because
`_layout.tsx` → `readCard.ts` → libhalo). This is enforced at the bundle entry:

1. `index.js` — `import './src/global';` runs first, then `require('expo-router/entry')`.
2. `src/global.js` — installs `self`, `crypto.getRandomValues`
   (`react-native-get-random-values`), `atob`/`btoa` (`base-64`), `Buffer`
   (`buffer`), and a minimal `process`.
3. `metro.config.js` — `extraNodeModules: require('expo-crypto-polyfills')` makes
   Node-style imports (`buffer`, `stream`, `crypto`, …) resolvable at bundle time.

Do not reorder these. See ADR-0002 before changing the polyfill set.

---

## Architecture & module responsibilities

```
src/
  app/
    _layout.tsx        Root layout. Pre-warms NfcManager.start() on mount.
    index.tsx          Single-screen UI. Connection controller (attempt tokens),
                       state machine, Reanimated choreography projection.
  nfc/
    nfcSession.ts      ⭐ Session owner. Single authority over the IsoDep session
                       lifecycle, SessionClosed dismissal, single-session guard,
                       concurrency-safe init. Injects a transport (DI seam).
    readCard.ts        Orchestrator. session → libhalo get_pkeys → validation →
                       slot policy. Returns a ReadOutcome ({ok, dismissed}).
    validation.ts      Runtime validation of libhalo's `any` return at the boundary.
    errors.ts          Stable CardErrorKind taxonomy + native/libhalo error mapping.
    log.ts             Restrained dev diagnostics (attempt ids, timings, no secrets).
  motion/
    phases.ts          Pure AppState → VisualPhase projection (unit-tested).
    useConnectionMotion.ts  Reanimated hook; a visual projection of state only.
  components/          Presentational (BurnerCard, ConnectControl, AddressBox, …).
  test/                Vitest fakes for react-native-nfc-manager + libhalo.
```

**Ownership boundaries (audit #9):**

- **Session owner** (`nfcSession.ts`) owns `NfcManager` and the `SessionClosed`
  listener. A module-level guard guarantees one active session process-wide.
- **libhalo adapter / card service** (`readCard.ts`) runs the command while the
  session is active and validates the result.
- **Runtime validation** (`validation.ts`) narrows libhalo's `any` return.
- **UI controller** (`index.tsx` `connect()`) owns the state machine and reveals
  only after `outcome.dismissed`. Reanimated (`useConnectionMotion`) is a pure
  visual projection — it owns no NFC truth.

---

## NFC lifecycle sequence

Per attempt (owned by `runIsoDepSession` in `nfcSession.ts`):

```
1. support check           await isSupported(IsoDep)   → not-supported if false
2. init (cached)           await ensureStarted()        → shared start() promise
3. register SessionClosed  setEventListener(SessionClosed, …)   ◀ BEFORE the sheet
4. present sheet           await requestTechnology(IsoDep, {alertMessage})
5. acquire tag             tag = await getTag()         → onTagDetected()
6. run command             await body(tag)              → libhalo SELECT + get_pkeys
7. validate + map slot     validation.ts + pickPrimarySlot
8. cancel (finally)        await cancelTechnologyRequest()   → triggers invalidation
9. SessionClosed fires     listener resolves `dismissed`     ◀ the real "sheet gone"
   safety fallback         if SessionClosed lost, resolve after 2000 ms (logged)
10. listener removed       setEventListener(SessionClosed, null)
```

The caller awaits `outcome.dismissed` (step 9) before any visible reveal, so the
success/error choreography never plays behind the still-open system sheet.

### Why SessionClosed (and not AppState / a timeout)

iOS `NFCTagReaderSession` invalidation calls
`tagReaderSession:didInvalidateWithError:`, which react-native-nfc-manager emits
as `NfcEvents.SessionClosed` **after** `cancelTechnologyRequest()` resolves. The
listener also receives the invalidation *reason* (`null` = user cancel, else an
`NfcError`). Presenting the NFC sheet does **not** change React Native
`AppState`, so an AppState poll is not a reliable dismissal signal (this was the
original bug). SessionClosed is authoritative; the 2000 ms safety timeout only
resolves if the event is somehow lost, and it is logged.

---

## Application state transition table

States (`src/motion/phases.ts`):

| State | Visual phase | Entered from | On exit |
| --- | --- | --- | --- |
| `disconnected` | idle | initial / cancel / error-timeout / disconnect | user taps Connect |
| `preparingToScan` | activating | Connect pressed | 320 ms arming beat |
| `scanning` | scanning | arm complete | `onTagDetected` / error |
| `reading` | reading | IsoDep tag connected | command result |
| `success` | verifying | `dismissed` resolved, command ok | `confirmPause` |
| `connected` | connected | success beat | Disconnect |
| `cancelled` | (idle, silent) | user backed out of sheet | immediately → disconnected |
| `timedOut` | error | 60 s native timeout before a tag | auto-dismiss 3.8 s |
| `unsupportedCard` | error | SELECT failed / missing slot 1 | auto-dismiss 3.8 s |
| `connectionFailed` | error | other read/transport failure | auto-dismiss 3.8 s |

The UI controller tags every async continuation with an attempt token
(`attemptRef`); stale callbacks from a superseded or unmounted attempt are
ignored, so an old error timer or a late success can never mutate the current
screen.

---

## Error taxonomy

`CardReadError.kind` (`src/nfc/errors.ts`) is derived from **structured** errors
— `instanceof` against `react-native-nfc-manager`'s `NfcError` classes
(minification-safe) plus duck-typing libhalo errors via `errorName`. No
human-readable string matching except the one native `"Duplicated registration"`
rejection, which has no structured form.

| `kind` | Source signal | UI |
| --- | --- | --- |
| `not-supported` | `isSupported(IsoDep)` false / `UnsupportedFeature` | silent → disconnected |
| `busy` | `"Duplicated registration"` / `SystemBusy` / 2nd concurrent session | silent → disconnected |
| `cancelled` | `NfcError.UserCancel` / `null` SessionClosed reason | silent → disconnected |
| `timedOut` | `NfcError.Timeout` (60 s reader timeout) | `timedOut` module |
| `no-card` | `getTag()` null / `TagConnectionLost` before read | `unsupportedCard` module |
| `unsupported-card` | libhalo SELECT failure / missing slot 1 | `unsupportedCard` module |
| `read-failed` | transceive / parse / validation failure | `connectionFailed` module |

The original code mapped nearly every acquire failure to `cancelled`, which made
`timedOut` and `unsupportedCard` unreachable and hid real failures behind a
silent return.

---

## Slot-1 policy

**Slot 1 is the Burner primary wallet key and is mandatory.** If a card responds
but lacks slot 1, the read fails as `unsupported-card` rather than silently
displaying another slot under the "primary wallet" label. This is a single
function (`pickPrimarySlot` in `readCard.ts`); change it there if fallback to the
lowest slot ever becomes supported product behavior, and add tests.

---

## Privacy & data retention

`get_pkeys` returns public keys (not private keys) and derived addresses. The app
retains only the **primary-slot address and slot number** in UI state
(`CardResult`). It does **not** retain other slots' addresses, compressed public
keys, or the tag id (`tagId` is never treated as a secure identity).

`src/nfc/log.ts` logs only stage names, attempt ids, and elapsed milliseconds —
never addresses, public keys, tag ids, APDU payloads, signatures, or challenges.

### What reading an address does NOT prove

Displaying a derived address proves **none** of:

- physical card authenticity,
- current ownership of the private key,
- user authorization,
- intent to sign a transaction.

Future authentication or signing must use an explicit challenge/signature
protocol with replay protection, domain separation, consent, and a threat model.
`get_pkeys` is read-only key retrieval.

---

## How to add another libhalo command

1. Add the command name + any args to a new orchestrator (mirror `readCard.ts`).
   `execHaloCmdRN(NfcManager, { name: '…', … })` runs **while the IsoDep session
   is active** — reuse `runIsoDepSession` so the lifecycle, SessionClosed
   dismissal, single-session guard, and cleanup are inherited.
2. Add a validator in `validation.ts` for the new response shape (libhalo returns
   `any`). Narrow at the boundary before reading any field.
3. Map command-specific failures in `errors.ts` onto `CardErrorKind` (extend the
   union if genuinely new).
4. Add tests using the fakes in `src/test/` (inject the transport; mock
   `execHaloCmdRN`).
5. If the command needs entitlements beyond `TAG` (e.g. NDEF reads), update
   `app.json` and rebuild natively.

---

## Unit tests

```bash
bun test            # vitest run
bun test:watch      # vitest watch
```

Tests live in `src/**/*.test.ts` and use the fakes in `src/test/`
(`react-native-nfc-manager` and `@arx-research/libhalo/api/react-native` are
aliased to controllable mocks in `vitest.config.ts`). Coverage:

- **validation** — structural, encoding, consistency, malformed payloads.
- **errors** — acquire / runtime / init mapping; UI projection.
- **nfcSession** — listener-before-request ordering, IsoDep request, tag-before-
  command, cancel exactly once, cleanup on every path, dismissal (SessionClosed
  before/after cancel, safety timeout, user cancel), single-session guard,
  concurrency-safe init + retry.
- **readCard** — slot-1 success, missing slot 1, malformed, unsupported device,
  `dismissed` on every outcome, `onTagDetected`, slot-1 policy.
- **phases** — exhaustive AppState → VisualPhase mapping.

These validate the JS contract on Node. **Native NFC lifecycle behavior is not
covered here** — see the physical-device QA matrix.

---

## Physical-device QA matrix

Perform on a physical iPhone (7+) with a development build. See
[`docs/physical-device-qa.md`](docs/physical-device-qa.md).

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Supported Burner/HaLo card | address shown; success reveal after sheet dismissal |
| 2 | Wrong ISO-DEP card (e.g. payment card) | `unsupported-card` (SELECT fails) |
| 3 | Cancel before tag detection | silent return to disconnected |
| 4 | Native 60 s timeout (don't tap) | `timedOut` |
| 5 | Remove card mid-APDU | silent cancel (or `connectionFailed`) |
| 6 | Rapid repeated Connect taps | only one session; extras ignored |
| 7 | Connect → Disconnect → rescan | clean re-read, no leaked listener |
| 8 | Background/foreground during scan | session invalidated; clean recovery |
| 9 | Release/Hermes build | works (polyfills intact) |
| 10 | New Architecture build | verify nfc-manager on New Arch |
| 11 | Entitlement/AID validation | verify generated `Info.plist`/`.entitlements` |
| 12 | Distribution-signed build | NFC entitlement valid under signing |

---

## Dependency & version policy

See [`docs/adr/`](docs/adr/) for rationale. Summary:

- **libhalo / nfc-manager**: caret ranges today; for this crypto/APDU boundary
  prefer pinning exact verified versions after testing. The matrix above records
  the tested set.
- **Known duplicates** (expo-doctor): `react-native-get-random-values`
  (`2.0.0` top-level + `1.11.0` nested) and `expo-file-system` (`57.0.0` +
  `13.1.4`), both pulled by `expo-crypto-polyfills@1.1.0` (an SDK ~50-era
  package). Resolving requires proving release-bundle + libhalo runtime still
  work — do not remove the polyfill just to silence expo-doctor. See ADR-0002.
- **react-native-tcp** (transitive, unmaintained) and `react-native-nfc-manager`
  are reported untested on the New Architecture.

### Upgrade checklist

1. Read the libhalo changelog + nfc-manager release notes for breaking APDU/API
   or AID changes.
2. Update `app.json` AIDs/entitlements if upstream guidance changes.
3. `bun install`, then `npx expo prebuild --clean` + native rebuild.
4. `bunx tsc --noEmit && bun test && bun run lint && bunx expo-doctor`.
5. Re-run the physical-device QA matrix with a real card.
6. Update the version table above.

---

## Project layout notes

- `package.json` `ios` script is pinned to one device UDID; adjust for your device.
- `scripts/ios-install.sh` is a local device-setup helper.
- `ios/` is generated — not committed; regenerate with `expo prebuild`.
