import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCardAddress, pickPrimarySlot, PRIMARY_WALLET_SLOT } from './readCard';
import { execHaloCmdRN } from '@arx-research/libhalo/api/react-native';
import { nfcManager, resetNfcMock } from 'react-native-nfc-manager';
import { __resetNfcSessionForTests } from './nfcSession';

/** Build a structurally valid get_pkeys response with the given slots. */
function pkeysFixture(slots: number[]): unknown {
  const publicKeys: Record<number, string> = {};
  const compressedPublicKeys: Record<number, string> = {};
  const etherAddresses: Record<number, string> = {};
  for (const slot of slots) {
    publicKeys[slot] = '04' + 'ab'.repeat(64);
    compressedPublicKeys[slot] = (slot % 2 ? '02' : '03') + 'cd'.repeat(32);
    etherAddresses[slot] = '0x' + String(slot).padStart(2, '0').repeat(20);
  }
  return { publicKeys, compressedPublicKeys, etherAddresses };
}

beforeEach(() => {
  resetNfcMock();
  __resetNfcSessionForTests();
  execHaloCmdRN.mockReset();
});

describe('readCardAddress', () => {
  it('returns the slot-1 address on a successful read', async () => {
    execHaloCmdRN.mockResolvedValue(pkeysFixture([1, 2]));
    const outcome = await readCardAddress(undefined, { transport: nfcManager });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.keySlot).toBe(1);
      expect(outcome.result.address).toBe('0x' + '01'.repeat(20));
    }
    expect(execHaloCmdRN).toHaveBeenCalledWith(expect.anything(), { name: 'get_pkeys' });
  });

  it('fails as unsupported-card when slot 1 is absent (no silent fallback)', async () => {
    execHaloCmdRN.mockResolvedValue(pkeysFixture([2, 3]));
    const outcome = await readCardAddress(undefined, { transport: nfcManager });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('unsupported-card');
  });

  it('fails as read-failed when the response is malformed', async () => {
    execHaloCmdRN.mockResolvedValue({});
    const outcome = await readCardAddress(undefined, { transport: nfcManager });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('read-failed');
  });

  it('fails as read-failed when libhalo returns no slots', async () => {
    execHaloCmdRN.mockResolvedValue({
      publicKeys: {},
      compressedPublicKeys: {},
      etherAddresses: {},
    });
    const outcome = await readCardAddress(undefined, { transport: nfcManager });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('read-failed');
  });

  it('does not call execHaloCmdRN when the device is unsupported', async () => {
    nfcManager.isSupported.mockResolvedValueOnce(false);
    const outcome = await readCardAddress(undefined, { transport: nfcManager });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('not-supported');
    expect(execHaloCmdRN).not.toHaveBeenCalled();
  });

  it('carries a dismissed promise that resolves on every outcome', async () => {
    execHaloCmdRN.mockResolvedValue(pkeysFixture([1]));
    const ok = await readCardAddress(undefined, { transport: nfcManager });
    await expect(ok.dismissed).resolves.toBeUndefined();

    nfcManager.isSupported.mockResolvedValueOnce(false);
    const bad = await readCardAddress(undefined, { transport: nfcManager });
    await expect(bad.dismissed).resolves.toBeUndefined();
  });

  it('fires onTagDetected when the tag connects', async () => {
    execHaloCmdRN.mockResolvedValue(pkeysFixture([1]));
    const onTagDetected = vi.fn();
    await readCardAddress(onTagDetected, { transport: nfcManager });
    expect(onTagDetected).toHaveBeenCalledTimes(1);
    expect(onTagDetected).toHaveBeenCalledWith(expect.objectContaining({ tech: 'IsoDep' }));
  });
});

describe('pickPrimarySlot (slot-1 policy)', () => {
  it('returns slot 1 when present', () => {
    expect(
      pickPrimarySlot({ 1: '0x' + 'a'.repeat(40), 2: '0x' + 'b'.repeat(40) }),
    ).toBe(PRIMARY_WALLET_SLOT);
  });
  it('throws when slot 1 is absent (no silent fallback)', () => {
    expect(() => pickPrimarySlot({ 2: '0x' + 'b'.repeat(40) })).toThrow(/slot 1/i);
  });
});
