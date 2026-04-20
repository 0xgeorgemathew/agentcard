import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runIsoDepSession,
  ensureStarted,
  __resetNfcSessionForTests,
} from './nfcSession';
import nfcManager, {
  NfcError,
  resetNfcMock,
  emitSessionClosed,
  hasSessionClosedListener,
} from 'react-native-nfc-manager';
import type { TagEvent } from 'react-native-nfc-manager';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetNfcMock();
  __resetNfcSessionForTests();
});

describe('runIsoDepSession — contract & ordering', () => {
  it('registers the SessionClosed listener BEFORE requestTechnology', async () => {
    const outcome = await runIsoDepSession(async () => 'RESULT');
    await outcome.dismissed;

    const listenerRegOrder = nfcManager.setEventListener.mock.invocationCallOrder[0];
    const requestOrder = nfcManager.requestTechnology.mock.invocationCallOrder[0];
    expect(listenerRegOrder).toBeLessThan(requestOrder);
  });

  it('requests IsoDep and runs the body against the connected tag', async () => {
    const body = vi.fn(async (tag: TagEvent) => `got:${tag.id ?? '?'}`);
    const outcome = await runIsoDepSession(body);
    await outcome.dismissed;

    expect(nfcManager.requestTechnology).toHaveBeenCalledWith('IsoDep', expect.any(Object));
    expect(body).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result).toBe('got:tag-1');
  });

  it('cancels the technology request exactly once per attempt', async () => {
    const outcome = await runIsoDepSession(async () => 'ok');
    await outcome.dismissed;
    expect(nfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it('removes the SessionClosed listener after dismissal', async () => {
    const outcome = await runIsoDepSession(async () => 'ok');
    await outcome.dismissed;
    expect(hasSessionClosedListener()).toBe(false);
  });
});

describe('runIsoDepSession — failure paths all tear down once', () => {
  it('returns not-supported without opening a session when IsoDep is unsupported', async () => {
    nfcManager.isSupported.mockResolvedValueOnce(false);
    const outcome = await runIsoDepSession(async () => 'x');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('not-supported');
    expect(nfcManager.requestTechnology).not.toHaveBeenCalled();
    await expect(outcome.dismissed).resolves.toBeUndefined();
  });

  it('maps a user cancel during acquire → cancelled and still tears down', async () => {
    nfcManager.requestTechnology.mockRejectedValueOnce(new NfcError.UserCancel());
    const outcome = await runIsoDepSession(async () => 'x');
    await outcome.dismissed;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('cancelled');
    expect(nfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(hasSessionClosedListener()).toBe(false);
  });

  it('maps a reader timeout → timedOut', async () => {
    nfcManager.requestTechnology.mockRejectedValueOnce(new NfcError.Timeout());
    const outcome = await runIsoDepSession(async () => 'x');
    if (!outcome.ok) expect(outcome.error.kind).toBe('timedOut');
  });

  it('maps a duplicated registration → busy', async () => {
    nfcManager.requestTechnology.mockRejectedValueOnce(new Error('Duplicated registration'));
    const outcome = await runIsoDepSession(async () => 'x');
    if (!outcome.ok) expect(outcome.error.kind).toBe('busy');
  });

  it('maps a null tag → no-card', async () => {
    nfcManager.getTag.mockResolvedValueOnce(null);
    const outcome = await runIsoDepSession(async () => 'x');
    if (!outcome.ok) expect(outcome.error.kind).toBe('no-card');
  });

  it('maps a libhalo SELECT failure → unsupported-card', async () => {
    const selectError = Object.assign(
      new Error('Unable to initiate communication with the tag. Failed to select HaLo core.'),
      { errorName: 'HaloLogicError' },
    );
    const outcome = await runIsoDepSession(async () => {
      throw selectError;
    });
    if (!outcome.ok) expect(outcome.error.kind).toBe('unsupported-card');
  });

  it('maps a generic body failure → read-failed and still cancels', async () => {
    const outcome = await runIsoDepSession(async () => {
      throw new Error('transceive broke');
    });
    await outcome.dismissed;
    if (!outcome.ok) expect(outcome.error.kind).toBe('read-failed');
    expect(nfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });
});

describe('runIsoDepSession — dismissal contract', () => {
  it('dismissed resolves after SessionClosed fires', async () => {
    const outcome = await runIsoDepSession(async () => 'ok');
    let resolved = false;
    outcome.dismissed.then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(true);
    expect(hasSessionClosedListener()).toBe(false);
  });

  it('resolves dismissal from a SessionClosed that arrives before cancel resolves', async () => {
    // SessionClosed fires while the command is still in flight (e.g. user pull).
    nfcManager.requestTechnology.mockImplementationOnce(async () => {
      queueMicrotask(() => emitSessionClosed(new NfcError.TagConnectionLost()));
      return 'IsoDep';
    });
    const outcome = await runIsoDepSession(async () => {
      throw new NfcError.TagConnectionLost();
    });
    await outcome.dismissed;
    if (!outcome.ok) expect(outcome.error.kind).toBe('cancelled');
    expect(hasSessionClosedListener()).toBe(false);
  });

  it('falls back to a safety timeout if SessionClosed never fires', async () => {
    vi.useFakeTimers();
    nfcManager.cancelTechnologyRequest.mockResolvedValue(undefined); // no SessionClosed emit
    const outcome = await runIsoDepSession(async () => 'ok');

    let resolved = false;
    outcome.dismissed.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    expect(resolved).toBe(true);
    expect(hasSessionClosedListener()).toBe(false);
    vi.useRealTimers();
  });
});

describe('runIsoDepSession — single-session ownership', () => {
  it('rejects a second concurrent session as busy', async () => {
    let releaseBody = () => {};
    const bodyPromise = new Promise<string>((resolve) => {
      releaseBody = () => resolve('first-ok');
    });
    const first = runIsoDepSession(async () => bodyPromise);

    // Let the first session advance into its body (sessionInProgress = true).
    await flush();

    const second = await runIsoDepSession(async () => 'second');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe('busy');

    releaseBody();
    const firstOutcome = await first;
    expect(firstOutcome.ok).toBe(true);
  });
});

describe('ensureStarted — concurrency-safe init', () => {
  it('shares one start() call across concurrent callers', async () => {
    __resetNfcSessionForTests();
    let startCalls = 0;
    nfcManager.start.mockImplementation(async () => {
      startCalls += 1;
    });
    await Promise.all([ensureStarted(), ensureStarted(), ensureStarted()]);
    expect(startCalls).toBe(1);
  });

  it('clears the cache on failure so a retry is possible', async () => {
    __resetNfcSessionForTests();
    nfcManager.start.mockRejectedValueOnce(new Error('boom'));
    await expect(ensureStarted()).rejects.toThrow('boom');
    nfcManager.start.mockResolvedValueOnce(undefined);
    await expect(ensureStarted()).resolves.toBeUndefined();
  });
});
