/**
 * Runtime validation of the @arx-research/libhalo get_pkeys response.
 *
 * `execHaloCmdRN` is declared to return `Promise<any>` (see
 * node_modules/@arx-research/libhalo/lib.esm/drivers/nfc_manager.d.ts), so a
 * TypeScript cast is not a safety check. This module narrows the untyped
 * boundary to a verified shape before any field is read, and rejects malformed
 * or inconsistent responses with a stable `CardReadError('read-failed')`,
 * preserving the original value as `cause` for diagnostics.
 *
 * Expected shape (libhalo halo/commands.ts cmdGetPkeys):
 *   { publicKeys, compressedPublicKeys, etherAddresses } — three slot maps
 *   keyed by key number, where:
 *     - etherAddresses[slot]   = '0x' + 40 hex (ethers.computeAddress, EIP-55)
 *     - compressedPublicKeys[slot] = 66 hex (33-byte secp256k1 compressed)
 *     - publicKeys[slot]       = 130 hex (65-byte uncompressed) — unused by the UI
 */
import { CardReadError } from './errors';

/** Slot→string map (object keys are always strings at runtime; slots are +integers). */
export type SlotMap = Record<number, string>;

export type ValidatedPkeys = {
  publicKeys: SlotMap;
  compressedPublicKeys: SlotMap;
  etherAddresses: SlotMap;
};

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const COMPRESSED_PUBKEY_RE = /^(02|03)[0-9a-fA-F]{64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Narrow one slot map: every key a positive integer, every value a string. */
function parseSlotMap(raw: unknown, field: string): SlotMap {
  if (!isRecord(raw)) {
    throw new CardReadError(`Malformed card response: "${field}" is not an object.`, 'read-failed', raw);
  }
  const out: SlotMap = {};
  for (const key of Object.keys(raw)) {
    const slot = Number(key);
    if (!Number.isInteger(slot) || slot < 1) {
      throw new CardReadError(`Malformed card response: invalid slot key "${key}" in "${field}".`, 'read-failed', raw);
    }
    const value = raw[key];
    if (typeof value !== 'string') {
      throw new CardReadError(`Malformed card response: "${field}[${key}]" is not a string.`, 'read-failed', raw);
    }
    out[slot] = value;
  }
  return out;
}

function sameSlots(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Validate the full get_pkeys response: structure, encoding, and cross-field
 * consistency. Throws CardReadError('read-failed') on the first problem.
 */
export function validateGetPkeysResponse(raw: unknown): ValidatedPkeys {
  if (!isRecord(raw)) {
    throw new CardReadError('Malformed card response: expected an object.', 'read-failed', raw);
  }

  const publicKeys = parseSlotMap(raw.publicKeys, 'publicKeys');
  const compressedPublicKeys = parseSlotMap(raw.compressedPublicKeys, 'compressedPublicKeys');
  const etherAddresses = parseSlotMap(raw.etherAddresses, 'etherAddresses');

  const pkSlots = Object.keys(publicKeys).map(Number).sort((x, y) => x - y);
  const cpkSlots = Object.keys(compressedPublicKeys).map(Number).sort((x, y) => x - y);
  const addrSlots = Object.keys(etherAddresses).map(Number).sort((x, y) => x - y);

  if (!sameSlots(pkSlots, cpkSlots) || !sameSlots(pkSlots, addrSlots)) {
    throw new CardReadError('Malformed card response: slot maps are inconsistent.', 'read-failed', raw);
  }
  if (pkSlots.length === 0) {
    throw new CardReadError('Card returned no public keys.', 'read-failed', raw);
  }

  for (const slot of pkSlots) {
    if (!ETH_ADDRESS_RE.test(etherAddresses[slot])) {
      throw new CardReadError(`Malformed card response: slot ${slot} has an invalid Ethereum address.`, 'read-failed', raw);
    }
    if (!COMPRESSED_PUBKEY_RE.test(compressedPublicKeys[slot])) {
      throw new CardReadError(`Malformed card response: slot ${slot} has an invalid compressed public key.`, 'read-failed', raw);
    }
  }

  return { publicKeys, compressedPublicKeys, etherAddresses };
}
