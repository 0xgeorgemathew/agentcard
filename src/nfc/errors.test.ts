import { describe, it, expect } from 'vitest';
import { NfcError } from 'react-native-nfc-manager';
import {
  mapAcquireError,
  mapRuntimeError,
  mapInitError,
  toUiErrorKind,
  CardReadError,
} from './errors';

/** Build a libhalo-shaped error (duck-typed via `errorName`). */
function haloError(message: string, errorName = 'HaloLogicError'): Error {
  const e = new Error(message) as Error & { errorName: string };
  e.errorName = errorName;
  e.name = errorName;
  return e;
}

describe('mapAcquireError (requestTechnology / getTag stage)', () => {
  it('maps UserCancel → cancelled', () => {
    expect(mapAcquireError(new NfcError.UserCancel()).kind).toBe('cancelled');
  });
  it('maps Timeout → timedOut', () => {
    expect(mapAcquireError(new NfcError.Timeout()).kind).toBe('timedOut');
  });
  it('maps SystemBusy → busy', () => {
    expect(mapAcquireError(new NfcError.SystemBusy()).kind).toBe('busy');
  });
  it('maps UnsupportedFeature → not-supported', () => {
    expect(mapAcquireError(new NfcError.UnsupportedFeature()).kind).toBe('not-supported');
  });
  it('maps SecurityViolation → not-supported', () => {
    expect(mapAcquireError(new NfcError.SecurityViolation()).kind).toBe('not-supported');
  });
  it('maps the native "Duplicated registration" string → busy', () => {
    expect(mapAcquireError(new Error('Duplicated registration')).kind).toBe('busy');
  });
  it('maps TagConnectionLost → no-card', () => {
    expect(mapAcquireError(new NfcError.TagConnectionLost()).kind).toBe('no-card');
  });
  it('maps an unknown error → read-failed', () => {
    expect(mapAcquireError(new Error('something else')).kind).toBe('read-failed');
  });
  it('preserves the original error as cause', () => {
    const src = new NfcError.Timeout();
    expect(mapAcquireError(src).cause).toBe(src);
  });
});

describe('mapRuntimeError (command stage)', () => {
  it('maps a libhalo SELECT-applet failure → unsupported-card', () => {
    const e = haloError('Unable to initiate communication with the tag. Failed to select HaLo core.');
    expect(mapRuntimeError(e, undefined).kind).toBe('unsupported-card');
  });
  it('maps other libhalo errors → read-failed', () => {
    expect(mapRuntimeError(haloError('Some other halo problem'), undefined).kind).toBe('read-failed');
  });
  it('treats a transport failure during the APDU as a (silent) cancel', () => {
    expect(mapRuntimeError(new NfcError.TagConnectionLost(), undefined).kind).toBe('cancelled');
    expect(mapRuntimeError(new NfcError.SessionInvalidated(), undefined).kind).toBe('cancelled');
  });
  it('treats a user-cancel SessionClosed reason as cancelled', () => {
    expect(mapRuntimeError(new Error('transceive failed'), null).kind).toBe('cancelled');
  });
  it('maps an unknown runtime error → read-failed', () => {
    expect(mapRuntimeError(new Error('unexpected'), new NfcError.Timeout()).kind).toBe('read-failed');
  });
});

describe('mapInitError (start)', () => {
  it('maps UnsupportedFeature → not-supported', () => {
    expect(mapInitError(new NfcError.UnsupportedFeature()).kind).toBe('not-supported');
  });
  it('maps unknown → read-failed', () => {
    expect(mapInitError(new Error('boom')).kind).toBe('read-failed');
  });
});

describe('toUiErrorKind', () => {
  it.each([
    ['timedOut', 'timedOut'],
    ['unsupported-card', 'unsupportedCard'],
    ['no-card', 'unsupportedCard'],
    ['read-failed', 'connectionFailed'],
  ] as const)('maps %s → %s', (kind, expected) => {
    expect(toUiErrorKind(kind)).toBe(expected);
  });
  it.each(['cancelled', 'not-supported', 'busy'] as const)('maps silent kind %s → null', (kind) => {
    expect(toUiErrorKind(kind)).toBeNull();
  });
});

describe('CardReadError', () => {
  it('carries its kind and message', () => {
    const e = new CardReadError('nope', 'read-failed');
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe('read-failed');
    expect(e.message).toBe('nope');
    expect(e.name).toBe('CardReadError');
  });
});
