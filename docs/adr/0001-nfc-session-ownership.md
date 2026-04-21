# ADR-0001: Dedicated NFC session owner with a deterministic dismissal promise

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

The original `src/nfc/readCard.ts` mixed NFC-manager lifecycle, libhalo command
execution, result parsing, and slot selection in one function. The audit found
several correctness defects rooted in that conflation:

1. The `SessionClosed` listener was registered before `requestTechnology`, but it
   was removed inside the command-stage `finally` **immediately after
   `cancelTechnologyRequest()` resolved**. On iOS,
   `tagReaderSession:didInvalidateWithError:` (which emits `SessionClosed`) fires
   *asynchronously after* the cancel promise resolves, so the listener was
   routinely removed before receiving the very event it existed to catch.
2. The UI dismissal gate (`awaitSheetDismissed`) polled an `AppState` ref that
   starts `true` and is reset to `true` immediately before scanning — so it
   resolved after its first 60 ms tick regardless of `SessionClosed`, letting the
   success choreography play **behind the still-open NFC sheet**.
3. The outer `requestTechnology`/`getTag` failure path did not call
   `cancelTechnologyRequest()` or remove the listener, leaking both on cancel.
4. A module-level `booted` boolean made `initNfc()` racy under concurrent callers.

## Decision

Introduce a single session owner, `src/nfc/nfcSession.ts`, that is the only
authority over the IsoDep session lifecycle. It provides:

- **Concurrency-safe init** (`ensureStarted`): one cached `start()` promise
  shared across callers; cleared on failure so retry is possible.
- **A module-level single-session guard**: a second `runIsoDepSession` while one
  is in progress returns `busy` without touching the native session.
- **Listener registered before the sheet, kept until the event fires**: the
  `SessionClosed` listener is installed before `requestTechnology` and removed
  only inside its own handler (or a documented 2000 ms safety fallback).
- **A deterministic `dismissed` promise**: `runIsoDepSession` returns an outcome
  `{ ok, result|error, dismissed }`. The caller awaits `dismissed` (the real
  `SessionClosed` event) before any visible reveal. AppState polling is removed.
- **One transport seam**: the NfcManager singleton is an injectable `NfcTransport`
  so the entire lifecycle is unit-testable with a fake.

`readCard.ts` becomes a thin orchestrator: session → libhalo → validation → slot
policy, returning the outcome pair and never throwing.

## Consequences

- The dismissal signal is the authoritative Core NFC invalidation event, not an
  AppState guess or a timeout. The success reveal can no longer race the sheet.
- Cleanup is centralized: every terminal path cancels exactly once and removes
  the listener exactly once (covered by `nfcSession.test.ts`).
- The UI (`index.tsx`) no longer manages NFC listeners or AppState; it only owns
  the state machine and attempt tokens, and treats `useConnectionMotion` as a
  pure visual projection.
- The `dismissed` promise must be awaited on **both** success and error paths;
  the outcome contract makes this explicit and un-ignorable.
