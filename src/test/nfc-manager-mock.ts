/**
 * Controllable fake of `react-native-nfc-manager` for unit tests.
 *
 * Mirrors the real module's surface used by src/nfc: the `NfcTech` / `NfcEvents`
 * constants, the `NfcError` class namespace (so `instanceof` checks in errors.ts
 * work against the SAME class objects tests throw), a minimal `TagEvent` type,
 * and a default-exported singleton whose methods are vitest mocks.
 *
 * By default the fake simulates a happy IsoDep session, and cancelTechnology-
 * Request emits SessionClosed on the next microtask — mimicking the native async
 * invalidation (`tagReaderSession:didInvalidateWithError:` fires after the cancel
 * promise resolves). Tests override any method to inject failures, and call
 * `emitSessionClosed()` to drive the dismissal signal manually.
 */
import { vi } from 'vitest';

export const NfcTech = {
  Ndef: 'Ndef',
  NfcA: 'NfcA',
  NfcB: 'NfcB',
  NfcF: 'NfcF',
  NfcV: 'NfcV',
  IsoDep: 'IsoDep',
  MifareClassic: 'MifareClassic',
  MifareUltralight: 'MifareUltralight',
  MifareIOS: 'mifare',
  Iso15693IOS: 'iso15693',
  FelicaIOS: 'felica',
  NdefFormatable: 'NdefFormatable',
} as const;

export const NfcEvents = {
  DiscoverTag: 'NfcManagerDiscoverTag',
  DiscoverBackgroundTag: 'NfcManagerDiscoverBackgroundTag',
  SessionClosed: 'NfcManagerSessionClosed',
  StateChanged: 'NfcManagerStateChanged',
} as const;

export class NfcErrorBase extends Error {}
export class UnsupportedFeature extends NfcErrorBase {}
export class SecurityViolation extends NfcErrorBase {}
export class InvalidParameter extends NfcErrorBase {}
export class InvalidParameterLength extends NfcErrorBase {}
export class ParameterOutOfBound extends NfcErrorBase {}
export class RadioDisabled extends NfcErrorBase {}
export class TagConnectionLost extends NfcErrorBase {}
export class RetryExceeded extends NfcErrorBase {}
export class TagResponseError extends NfcErrorBase {}
export class SessionInvalidated extends NfcErrorBase {}
export class TagNotConnected extends NfcErrorBase {}
export class PacketTooLong extends NfcErrorBase {}
export class UserCancel extends NfcErrorBase {}
export class Timeout extends NfcErrorBase {}
export class Unexpected extends NfcErrorBase {}
export class SystemBusy extends NfcErrorBase {}
export class FirstNdefInvalid extends NfcErrorBase {}
export class InvalidConfiguration extends NfcErrorBase {}
export class TagNotWritable extends NfcErrorBase {}
export class TagUpdateFailure extends NfcErrorBase {}
export class TagSizeTooSmall extends NfcErrorBase {}
export class ZeroLengthMessage extends NfcErrorBase {}

export const NfcError = {
  NfcErrorBase,
  UnsupportedFeature,
  SecurityViolation,
  InvalidParameter,
  InvalidParameterLength,
  ParameterOutOfBound,
  RadioDisabled,
  TagConnectionLost,
  RetryExceeded,
  TagResponseError,
  SessionInvalidated,
  TagNotConnected,
  PacketTooLong,
  UserCancel,
  Timeout,
  Unexpected,
  SystemBusy,
  FirstNdefInvalid,
  InvalidConfiguration,
  TagNotWritable,
  TagUpdateFailure,
  TagSizeTooSmall,
  ZeroLengthMessage,
};

export type TagEvent = { id?: string; tech?: string; [key: string]: unknown };

type SessionClosedListener = ((error?: unknown) => void) | null;

let sessionClosedListener: SessionClosedListener = null;

export const nfcManager = {
  start: vi.fn(() => Promise.resolve()),
  isSupported: vi.fn((_tech?: string) => Promise.resolve(true)),
  requestTechnology: vi.fn(
    (_tech: string | string[], _opts?: { alertMessage?: string }) => Promise.resolve('IsoDep'),
  ),
  getTag: vi.fn(() => Promise.resolve<TagEvent | null>({ id: 'tag-1', tech: 'IsoDep' })),
  cancelTechnologyRequest: vi.fn((_opts?: { throwOnError?: boolean }) => Promise.resolve()),
  setEventListener: vi.fn((name: string, cb: SessionClosedListener) => {
    if (name === NfcEvents.SessionClosed) {
      sessionClosedListener = cb;
    }
  }),
};

export default nfcManager;

/** Fire the captured SessionClosed listener. Omit arg (or pass null) = user cancel. */
export function emitSessionClosed(error?: unknown): void {
  sessionClosedListener?.(error ?? null);
}

/** True while the session owner holds a SessionClosed listener. */
export function hasSessionClosedListener(): boolean {
  return sessionClosedListener !== null;
}

/** Restore default resolved behaviors + clear the captured listener + reset mocks. */
export function resetNfcMock(): void {
  sessionClosedListener = null;
  nfcManager.start.mockReset();
  nfcManager.start.mockResolvedValue(undefined);
  nfcManager.isSupported.mockReset();
  nfcManager.isSupported.mockResolvedValue(true);
  nfcManager.requestTechnology.mockReset();
  nfcManager.requestTechnology.mockResolvedValue('IsoDep');
  nfcManager.getTag.mockReset();
  nfcManager.getTag.mockResolvedValue({ id: 'tag-1', tech: 'IsoDep' });
  // cancel resolves, THEN SessionClosed fires on the next microtask (like native).
  nfcManager.cancelTechnologyRequest.mockReset();
  nfcManager.cancelTechnologyRequest.mockImplementation(async () => {
    queueMicrotask(() => emitSessionClosed());
  });
  nfcManager.setEventListener.mockReset();
  nfcManager.setEventListener.mockImplementation((name: string, cb: SessionClosedListener) => {
    if (name === NfcEvents.SessionClosed) {
      sessionClosedListener = cb;
    }
  });
}
