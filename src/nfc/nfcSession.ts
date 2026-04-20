/**
 * NFC session owner — the single authority over the react-native-nfc-manager
 * IsoDep session lifecycle for this app.
 *
 * Responsibilities (the invariants the rest of the app relies on):
 *   - concurrency-safe NfcManager.start() via a cached promise (audit #8);
 *   - a module-level guard so only one read attempt can own the native session
 *     at a time (audit #9);
 *   - a correct IsoDep support check that actually CALLS isSupported (audit #1);
 *   - the SessionClosed listener registered BEFORE requestTechnology, and kept
 *     alive until the event fires (or a documented safety fallback), so the
 *     listener is never removed before the dismissal signal it carries (audit #2,#3);
 *   - cancellation + listener cleanup on EVERY terminal path, exactly once;
 *   - a `dismissed` promise the caller awaits before any visible reveal, so the
 *     success/error choreography never plays behind the still-open system sheet
 *     (audit #4) — with NO reliance on AppState or arbitrary timeouts as the
 *     primary signal.
 *
 * The transport is an injectable interface (defaults to the NfcManager
 * singleton) so the full lifecycle can be unit-tested with a fake transport.
 */
import NfcManagerDefault, {
  NfcTech,
  NfcEvents,
  type TagEvent,
} from 'react-native-nfc-manager';

import { CardReadError, mapAcquireError, mapInitError, mapRuntimeError } from './errors';
import { log, warn, nextAttemptId } from './log';

/**
 * The subset of the NfcManager singleton this owner drives. Production code
 * passes the real singleton (default); tests pass a fake that records calls.
 */
export type NfcTransport = {
  start(): Promise<unknown>;
  isSupported(tech?: string): Promise<boolean>;
  requestTechnology(tech: string | string[], options?: { alertMessage?: string }): Promise<unknown>;
  getTag(): Promise<TagEvent | null>;
  cancelTechnologyRequest(options?: { throwOnError?: boolean }): Promise<unknown>;
  setEventListener(name: string, callback: ((error?: unknown) => void) | null): void;
};

/** A read result is always paired with a dismissal promise (success or failure). */
export type SessionOutcome<T> =
  | { ok: true; result: T; dismissed: Promise<void> }
  | { ok: false; error: CardReadError; dismissed: Promise<void> };

const ALERT_MESSAGE = 'Hold your Burner near the top of your iPhone.';
/**
 * Safety ceiling for the dismissal promise. On iOS, cancelTechnologyRequest()
 * invalidates the reader session and `readerSession:didInvalidateWithError:`
 * emits SessionClosed within milliseconds. This fallback only resolves if that
 * event is somehow lost (a native race); it is logged loudly and is never the
 * primary dismissal signal.
 */
const DISMISSAL_SAFETY_MS = 2000;

// ── concurrency-safe init (audit #8) ────────────────────────────────────────
let startPromise: Promise<void> | null = null;

/**
 * Start the NFC manager exactly once, sharing the in-flight promise across
 * concurrent callers (e.g. root layout pre-warm + a fast user tap). A failure
 * clears the cache so the next attempt retries instead of being poisoned.
 */
export function ensureStarted(transport: NfcTransport = NfcManagerDefault): Promise<void> {
  if (startPromise) return startPromise;
  const p = transport.start().then(
    () => undefined,
    (err: unknown) => {
      startPromise = null; // allow retry on failure
      throw err;
    },
  );
  startPromise = p;
  return p;
}

// ── single-session ownership (audit #9) ─────────────────────────────────────
let sessionInProgress = false;

/**
 * Open an IsoDep session, run `body` against the connected tag while the session
 * is active, and tear the session down exactly once. Returns an outcome paired
 * with a `dismissed` promise the caller MUST await before revealing anything.
 *
 * `body` receives the connected tag and should run the card command (libhalo),
 * returning a validated, typed result. Any throw from `body` is mapped by the
 * runtime-error taxonomy.
 */
export async function runIsoDepSession<T>(
  body: (tag: TagEvent) => Promise<T>,
  opts: { transport?: NfcTransport; onTagDetected?: (tag: TagEvent | null) => void } = {},
): Promise<SessionOutcome<T>> {
  const transport = opts.transport ?? NfcManagerDefault;
  const attemptId = nextAttemptId();
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const immediateDismissal = Promise.resolve();
  log(attemptId, 'init');

  // One session at a time — this owner is authoritative.
  if (sessionInProgress) {
    warn('NFC session requested while another is in progress.');
    return {
      ok: false,
      error: new CardReadError('An NFC session is already active.', 'busy'),
      dismissed: immediateDismissal,
    };
  }

  // Support check that actually calls isSupported (audit #1).
  let supported: boolean;
  try {
    supported = await transport.isSupported(NfcTech.IsoDep);
  } catch {
    supported = false;
  }
  if (!supported) {
    log(attemptId, 'unsupported');
    return {
      ok: false,
      error: new CardReadError('NFC (IsoDep) is not supported on this device.', 'not-supported'),
      dismissed: immediateDismissal,
    };
  }

  // Concurrency-safe init shared with the root-layout pre-warm (audit #8).
  try {
    await ensureStarted(transport);
  } catch (e) {
    log(attemptId, 'init-failed', elapsed());
    return { ok: false, error: mapInitError(e), dismissed: immediateDismissal };
  }

  sessionInProgress = true;
  log(attemptId, 'request', elapsed());

  // Dismissal promise + the authoritative SessionClosed listener, registered
  // BEFORE requestTechnology presents the system sheet (audit #2,#3).
  let resolveDismissal!: () => void;
  const dismissed = new Promise<void>((resolve) => {
    resolveDismissal = resolve;
  });
  let settled = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  // Reason delivered by SessionClosed: null/undefined = user cancel, else an NfcError.
  let sessionClosedReason: unknown;
  const resolveOnce = (via: 'session-closed' | 'safety-timeout') => {
    if (settled) return;
    settled = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    try {
      transport.setEventListener(NfcEvents.SessionClosed, null);
    } catch {
      /* transport may be tearing down; ignore */
    }
    if (via === 'safety-timeout') {
      warn(`[${attemptId}] SessionClosed did not fire within ${DISMISSAL_SAFETY_MS}ms; proceeding via fallback.`);
    }
    resolveDismissal();
  };
  transport.setEventListener(NfcEvents.SessionClosed, (error) => {
    sessionClosedReason = error;
    log(attemptId, 'session-closed', elapsed());
    resolveOnce('session-closed');
  });

  try {
    let tag: TagEvent | null = null;
    try {
      await transport.requestTechnology(NfcTech.IsoDep, { alertMessage: ALERT_MESSAGE });
      tag = await transport.getTag();
    } catch (e) {
      // Acquire-stage failure: user cancel, 60s timeout, duplicate session, etc.
      log(attemptId, 'acquire-failed', elapsed());
      throw mapAcquireError(e);
    }
    log(attemptId, 'tag-detected', elapsed());
    opts.onTagDetected?.(tag);
    if (!tag) {
      throw new CardReadError('No card detected.', 'no-card');
    }

    log(attemptId, 'command-start', elapsed());
    const result = await body(tag); // libhalo SELECT + get_pkeys; throws on card failure
    log(attemptId, 'command-done', elapsed());
    return { ok: true, result, dismissed };
  } catch (e) {
    const error = e instanceof CardReadError ? e : mapRuntimeError(e, sessionClosedReason);
    log(attemptId, `error:${error.kind}`, elapsed());
    return { ok: false, error, dismissed };
  } finally {
    // Trigger invalidation → SessionClosed; the listener stays registered until
    // that event fires (or the safety fallback), so the dismissal signal is
    // never lost by being removed too early.
    log(attemptId, 'cancel-requested', elapsed());
    try {
      await transport.cancelTechnologyRequest({ throwOnError: false });
    } catch {
      /* best-effort teardown */
    }
    safetyTimer = setTimeout(() => resolveOnce('safety-timeout'), DISMISSAL_SAFETY_MS);
    sessionInProgress = false;
  }
}

/** @internal Reset module-level state so unit tests start clean. */
export function __resetNfcSessionForTests(): void {
  startPromise = null;
  sessionInProgress = false;
}
