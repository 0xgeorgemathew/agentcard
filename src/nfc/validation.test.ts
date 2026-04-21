import { describe, it, expect } from 'vitest';
import { validateGetPkeysResponse } from './validation';
import { CardReadError } from './errors';

/** A structurally valid multi-slot get_pkeys response. */
function fixture(): unknown {
  return {
    publicKeys: { 1: '04' + 'ab'.repeat(64), 2: '04' + 'cd'.repeat(64) },
    compressedPublicKeys: { 1: '02' + 'ab'.repeat(32), 2: '03' + 'cd'.repeat(32) },
    etherAddresses: { 1: '0x' + 'ab'.repeat(20), 2: '0x' + 'cd'.repeat(20) },
  };
}

describe('validateGetPkeysResponse', () => {
  it('accepts a valid multi-slot response', () => {
    const v = validateGetPkeysResponse(fixture());
    expect(Object.keys(v.etherAddresses).map(Number).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('accepts a single slot-1 response', () => {
    const v = validateGetPkeysResponse({
      publicKeys: { 1: '04' + 'ab'.repeat(64) },
      compressedPublicKeys: { 1: '02' + 'ab'.repeat(32) },
      etherAddresses: { 1: '0x' + 'ab'.repeat(20) },
    });
    expect(v.etherAddresses[1]).toBe('0x' + 'ab'.repeat(20));
  });

  it('rejects a non-object response', () => {
    expect(() => validateGetPkeysResponse('nope')).toThrow(CardReadError);
    expect(() => validateGetPkeysResponse(null)).toThrow(CardReadError);
    expect(() => validateGetPkeysResponse(undefined)).toThrow(CardReadError);
  });

  it('rejects a response with missing slot maps', () => {
    expect(() => validateGetPkeysResponse({})).toThrow(/"publicKeys" is not an object/i);
  });

  it('rejects a response whose slot maps are all empty', () => {
    expect(() =>
      validateGetPkeysResponse({ publicKeys: {}, compressedPublicKeys: {}, etherAddresses: {} }),
    ).toThrow(/no public keys/i);
  });

  it('rejects non-integer / non-positive slot keys', () => {
    expect(() =>
      validateGetPkeysResponse({ publicKeys: { abc: 'x' }, compressedPublicKeys: {}, etherAddresses: {} }),
    ).toThrow(/invalid slot key/i);
    expect(() =>
      validateGetPkeysResponse({ publicKeys: { 0: 'x' }, compressedPublicKeys: {}, etherAddresses: {} }),
    ).toThrow(/invalid slot key/i);
  });

  it('rejects a non-string slot value', () => {
    const bad = {
      publicKeys: { 1: '04' + 'ab'.repeat(64) },
      compressedPublicKeys: { 1: '02' + 'ab'.repeat(32) },
      etherAddresses: { 1: 12345 as unknown as string },
    };
    expect(() => validateGetPkeysResponse(bad)).toThrow(/not a string/i);
  });

  it('rejects inconsistent slot maps', () => {
    const bad = {
      publicKeys: { 1: 'x' },
      compressedPublicKeys: { 1: '02' + 'ab'.repeat(32) },
      etherAddresses: { 2: '0x' + 'ab'.repeat(20) },
    };
    expect(() => validateGetPkeysResponse(bad)).toThrow(/inconsistent/i);
  });

  it('rejects an invalid ethereum address', () => {
    const bad = fixture();
    (bad as { etherAddresses: Record<number, string> }).etherAddresses[1] = '0xdeadbeef';
    expect(() => validateGetPkeysResponse(bad)).toThrow(/invalid Ethereum address/i);
  });

  it('rejects a compressed public key with the wrong prefix / length', () => {
    const bad = fixture();
    (bad as { compressedPublicKeys: Record<number, string> }).compressedPublicKeys[1] =
      '04' + 'ab'.repeat(32); // uncompressed prefix
    expect(() => validateGetPkeysResponse(bad)).toThrow(/invalid compressed public key/i);
  });

  it('preserves the malformed payload as cause for diagnostics', () => {
    try {
      validateGetPkeysResponse('nope');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CardReadError);
      expect((e as CardReadError).cause).toBe('nope');
    }
  });
});
