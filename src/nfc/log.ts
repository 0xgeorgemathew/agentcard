/**
 * Restrained development diagnostics for the NFC read flow.
 *
 * Emits a short stage trace per attempt — each stage tagged with an attempt id
 * and elapsed-ms — so a slow or failing read can be followed end to end in the
 * device console. Stage logs are dev-only (gated on __DEV__) so release builds
 * carry no chatty NFC logging. `warn` is always emitted (used for the rare
 * SessionClosed fallback path that should be investigated).
 *
 * Privacy: NEVER log addresses, public keys, tag ids, APDU payloads, signatures,
 * challenges, or any card material. This module is passed only stage names,
 * timings, kinds, and attempt ids — it has no access to card data by construction.
 */

let attemptCounter = 0;

/** Monotonic per-process attempt id (e.g. "nfc-1", "nfc-2"). */
export function nextAttemptId(): string {
  attemptCounter += 1;
  return `nfc-${attemptCounter}`;
}

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/** Log a named stage for an attempt, with optional ms-since-attempt-start. */
export function log(attemptId: string, stageName: string, elapsedMs?: number): void {
  if (!isDev) return;
  const elapsed = elapsedMs !== undefined ? ` +${Math.round(elapsedMs)}ms` : '';
  console.log(`[nfc ${attemptId}] ${stageName}${elapsed}`);
}

/** Always-on warning (rare fallback paths). */
export function warn(message: string): void {
  console.warn(`[nfc] ${message}`);
}
