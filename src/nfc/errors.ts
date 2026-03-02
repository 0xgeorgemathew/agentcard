/**
 * Stable application error taxonomy for the NFC read flow.
 *
 * react-native-nfc-manager throws typed error classes (the `NfcError` namespace,
 * e.g. `NfcError.UserCancel`, `NfcError.Timeout`) and @arx-research/libhalo
 * throws `HaloLogicError` / `HaloTagError`. This module maps every native /
 * library / transport failure onto a small, stable set of product-facing
 * `CardErrorKind` values that the UI renders directly.
 *
 * Discrimination uses `instanceof` against the exported `NfcError` classes —
 * minification-safe — plus a single isolated string check for the native
 * "Duplicated registration" rejection, which has no structured form. We never
 * pattern-match on human-readable error prose for the common cases.
 */
import { NfcError } from 'react-native-nfc-manager';

export type CardErrorKind =
  | 'not-supported' // device/session cannot do IsoDep
  | 'busy' // another NFC session is already active
  | 'cancelled' // user dismissed the system sheet (silent return to idle)
  | 'timedOut' // 60s native reader timeout before a tag was found
  | 'no-card' // session opened but no tag, or tag lost before the read
  | 'unsupported-card' // a card responded but it is not a HaLo/Burner applet
  | 'read-failed'; // transport / parse / validation failure (catch-all)

export class CardReadError extends Error {
  readonly kind: CardErrorKind;

  constructor(message: string, kind: CardErrorKind, readonly cause?: unknown) {
    super(message);
    this.name = 'CardReadError';
    this.kind = kind;
  }
}

/** libhalo errors all carry an `errorName` property (HaloLogicError/HaloTagError). */
type HaloErrorLike = Error & { errorName: string };
function isHaloError(e: unknown): e is HaloErrorLike {
  return e instanceof Error && typeof (e as Error & { errorName?: unknown }).errorName === 'string';
}

/** SELECT-applet failure message from libhalo (`selectCore` in drivers/nfc_manager). */
const SELECT_CORE_RE = /failed to select halo core/i;

/**
 * Map a failure from requestTechnology()/getTag() (the "acquire" stage, before
 * any APDU is sent). These arrive as typed `NfcError` instances.
 */
export function mapAcquireError(e: unknown): CardReadError {
  if (e instanceof NfcError.UserCancel) {
    return new CardReadError('User cancelled the NFC scan.', 'cancelled', e);
  }
  if (e instanceof NfcError.Timeout) {
    return new CardReadError('No card detected before the NFC timeout.', 'timedOut', e);
  }
  if (e instanceof NfcError.SystemBusy) {
    return new CardReadError('NFC subsystem is busy.', 'busy', e);
  }
  if (e instanceof NfcError.UnsupportedFeature) {
    return new CardReadError('NFC is not supported on this device.', 'not-supported', e);
  }
  if (e instanceof NfcError.SecurityViolation) {
    return new CardReadError('NFC security restriction blocked the scan.', 'not-supported', e);
  }
  if (e instanceof NfcError.TagConnectionLost || e instanceof NfcError.TagNotConnected) {
    return new CardReadError('Lost the card before the read started.', 'no-card', e);
  }

  // The native "Duplicated registration" string (NfcManager.m requestTechnology)
  // is the structured signal that a session is already active; it has no NfcError class.
  const message = e instanceof Error ? e.message : String(e);
  if (/duplicated registration/i.test(message)) {
    return new CardReadError('An NFC session is already active.', 'busy', e);
  }

  return new CardReadError('Could not start the NFC read.', 'read-failed', e);
}

/**
 * Map a failure from the command stage (libhalo execHaloCmdRN / transceive).
 * `sessionClosedReason` is the typed reason delivered by the SessionClosed event
 * (null/undefined = user cancel; an NfcError instance otherwise). When the
 * transport fails mid-APDU it lets us distinguish a deliberate user cancel
 * (silent) from a genuine read failure.
 */
export function mapRuntimeError(e: unknown, sessionClosedReason: unknown): CardReadError {
  // `null` is the explicit UserCancel signal from `_onSessionClosedIOS`
  // (callback(error instanceof UserCancel ? null : error)); an NfcError.UserCancel
  // instance likewise. `undefined` means SessionClosed has NOT fired yet (the
  // command failed first) — it is NOT a cancel signal, so we fall through to the
  // error itself.
  const isUserCancel =
    sessionClosedReason === null || sessionClosedReason instanceof NfcError.UserCancel;
  if (
    isUserCancel ||
    e instanceof NfcError.TagConnectionLost ||
    e instanceof NfcError.TagNotConnected ||
    e instanceof NfcError.SessionInvalidated
  ) {
    return new CardReadError('User cancelled the NFC scan.', 'cancelled', e);
  }

  // libhalo could not SELECT the HaLo applet → wrong / unsupported card.
  if (isHaloError(e)) {
    if (SELECT_CORE_RE.test(e.message)) {
      return new CardReadError('This card is not a supported Arx Burner.', 'unsupported-card', e);
    }
    return new CardReadError('The card rejected the read command.', 'read-failed', e);
  }

  return new CardReadError('Failed to read the card.', 'read-failed', e);
}

/** Map a failure from NfcManager.start() (init). */
export function mapInitError(e: unknown): CardReadError {
  if (e instanceof NfcError.UnsupportedFeature) {
    return new CardReadError('NFC is not supported on this device.', 'not-supported', e);
  }
  return new CardReadError('Could not start the NFC subsystem.', 'read-failed', e);
}

/**
 * Project an internal kind onto the three UI error variants. `cancelled` and
 * `not-supported`/`busy` are terminal-but-silent (no error module shown).
 */
export function toUiErrorKind(kind: CardErrorKind): 'timedOut' | 'unsupportedCard' | 'connectionFailed' | null {
  switch (kind) {
    case 'timedOut':
      return 'timedOut';
    case 'unsupported-card':
    case 'no-card':
      return 'unsupportedCard';
    case 'read-failed':
      return 'connectionFailed';
    default:
      return null;
  }
}
