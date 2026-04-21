# ADR-0002: Dependency and polyfill policy

- **Status:** Accepted (with deferred remediation)
- **Date:** 2026-07-12

## Context

`expo-doctor` reports three failures for this project:

1. **Duplicate native modules**, both pulled transitively by
   `expo-crypto-polyfills@1.1.0` (an Expo SDK ~50-era package):
   - `react-native-get-random-values`: `2.0.0` top-level vs `1.11.0` nested.
   - `expo-file-system`: `57.0.0` top-level vs `13.1.4` nested.
2. `react-native-nfc-manager` and `react-native-tcp` are **untested on the New
   Architecture**; `react-native-tcp` is **unmaintained**.
3. `react-native-get-random-values` **major-version mismatch**: installed `2.0.0`,
   Expo SDK 57 expects `~1.11.0`.

`expo-crypto-polyfills` exists because libhalo → ethers → `@noble/curves` need
Node/browser globals (`Buffer`, `process`, `crypto`, `stream`, …) that Hermes
does not provide. It is wired in `src/global.js` and `metro.config.js`.

## Decision

**Do not change the polyfill/dependency set as part of this audit.** The NFC
correctness work is independent of these dependency-health warnings, and the
prompt explicitly requires proving release-bundle + libhalo runtime behavior
before removing a polyfill. That proof requires a physical-device Release/Hermes
build, which is outside what automated JS tests can verify.

Record the policy and defer remediation:

- Treat `expo-crypto-polyfills` as load-bearing until proven otherwise. Its
  removal/dedup is a follow-up requiring release verification, not a silent fix.
- For this crypto/APDU boundary, prefer **pinning exact verified versions** of
  `@arx-research/libhalo` and `react-native-nfc-manager` (currently caret
  ranges). Pin only after re-running the physical-device QA matrix.
- Track the New Architecture status of `react-native-nfc-manager` upstream before
  making New Arch a hard requirement.

## Remediation candidates (require device/release verification)

- Align `react-native-get-random-values` to Expo's expected `~1.11.0` (would also
  dedupe the nested `1.11.0`). Verify `crypto.getRandomValues` still works in a
  Release/Hermes build and that libhalo still derives addresses.
- Evaluate whether `expo-crypto-polyfills` can be replaced by a smaller, SDK-57
  -compatible polyfill set (e.g. direct `buffer` + `react-native-get-random-values`
  + `process` + a crypto shim), removing the old nested copies and
  `react-native-tcp`.
- After any change: `bun install` → `npx expo prebuild --clean` → native rebuild
  → full QA matrix → `expo-doctor` clean.

## Consequences

- The app builds and runs today with the known duplicates; they are a health
  concern (binary size, potential native-registration collision), not a known
  runtime break.
- Anyone changing dependencies must perform the release verification above; the
  checklist is in the README.
