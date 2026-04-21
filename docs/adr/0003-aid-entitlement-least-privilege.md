# ADR-0003: NFC AID and entitlement least-privilege

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

The audit asked whether the NDEF entitlement and the D276 (NDEF) AIDs in
`app.json` are required, given that `get_pkeys` never reads NDEF. libhalo's
`selectCore` (`node_modules/@arx-research/libhalo/.../aid.ts`) issues SELECT for
only the two HaLo AIDs:

```
00A404000AA0000009490148614C6F00   (A0000009490148614C6F — HaLo)
00A4040007481199130E9F0100         (481199130E9F01 — Burner)
```

However, iOS uses `com.apple.developer.nfc.readersession.iso7816.select-
identifiers` as a **detection filter**: a tag is presented to the reader session
only if it advertises one of the listed AIDs. So the AID list determines which
cards iOS will surface at all — independent of which AIDs libhalo SELECTs after
connection.

libhalo's **official Expo guide** (`docs/mobile-expo.md`) lists three
`selectIdentifiers`:

```
A0000009490148614C6F
481199130E9F01
D2760000850101
```

and keeps `includeNdefEntitlement: true`. The project previously had a fourth AID,
`D2760000850100` (the legacy/alternate NFC Forum Type 4 DF name), which the
libhalo guide does **not** include.

## Decision

**Align to libhalo's authoritative Expo guide** rather than aggressively trim:

- Keep `A0000009490148614C6F`, `481199130E9F01`, `D2760000850101`.
- **Remove `D2760000850100`** (not in libhalo's guide; redundant).
- Keep `includeNdefEntitlement: true` (matches upstream).

## Rationale

The First Law here is **correctness — do not break card detection**. AID-filter
mistakes manifest as "the card is never detected," a failure mode that neither
the iOS simulator nor any unit test can surface. libhalo's authors know which
AIDs their card generations advertise; their published guide is the safest
authority. Removing only the one AID they do not list is a minimal, defensible
reduction. Aggressively dropping the NDEF AID/entitlement to reach strict least
privilege would trade a small entitlement reduction for real detection risk on
card generations we cannot test here.

## Consequences

- One redundant AID removed; entitlement scope matches upstream guidance.
- The change requires `npx expo prebuild --clean` + a native rebuild, and must be
  confirmed against real Burner/HaLo cards (QA matrix #1, #2, #11).
- If a future product decision makes NDEF reading unsupported, revisit
  `includeNdefEntitlement` and the D276 AID together.
