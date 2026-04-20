/**
 * NFC read flow for Arx Burner / HaLo cards.
 *
 * Thin orchestrator over the session owner (`nfcSession`) and the libhalo
 * adapter. One tap → (session owner) IsoDep connect → (libhalo) SELECT applet +
 * get_pkeys → (validation) verify the response → (slot policy) pick slot 1.
 * libhalo derives the EIP-55 address internally (keccak256); we surface it.
 *
 * Public contract: `readCardAddress` NEVER throws — it returns a `ReadOutcome`
 * that pairs a typed result/error with a `dismissed` promise. The caller awaits
 * `dismissed` before any visible reveal so the choreography never races the
 * still-open native NFC sheet.
 *
 * Reference: https://github.com/arx-research/libhalo/blob/master/docs/mobile-expo.md
 */
import NfcManagerDefault, { type TagEvent } from 'react-native-nfc-manager';
import { execHaloCmdRN } from '@arx-research/libhalo/api/react-native';

import { runIsoDepSession, ensureStarted, type NfcTransport } from './nfcSession';
import { validateGetPkeysResponse, type SlotMap, type ValidatedPkeys } from './validation';
import { CardReadError } from './errors';

export { CardReadError } from './errors';
export type { CardErrorKind } from './errors';
export type { SlotMap };
/** Idempotent, concurrency-safe NFC manager start. Call on app launch. */
export const initNfc = ensureStarted;

/**
 * What the app retains from a successful read. Deliberately minimal (audit #17):
 * the UI shows only the primary-slot address. We do NOT retain other slots'
 * addresses, public keys, or the tag id — data minimization. tagId is never
 * treated as a secure identity (see README §Privacy).
 */
export type CardResult = {
  /** EIP-55 checksummed Ethereum address from the primary wallet slot. */
  address: string;
  /** Slot the address was read from (always PRIMARY_WALLET_SLOT for a Burner). */
  keySlot: number;
};

/**
 * Product slot policy. Slot 1 is the Burner primary wallet key. A card that
 * responds but lacks slot 1 is not in the expected Burner configuration — fail
 * explicitly rather than silently display another slot under the "primary
 * wallet" label (audit #7). Change this single function if fallback becomes a
 * supported product behavior.
 */
export const PRIMARY_WALLET_SLOT = 1;
export function pickPrimarySlot(addresses: SlotMap): number {
  if (!(PRIMARY_WALLET_SLOT in addresses)) {
    throw new CardReadError(
      'Card is missing the primary wallet key (slot 1).',
      'unsupported-card',
    );
  }
  return PRIMARY_WALLET_SLOT;
}

/** Outcome of a read attempt. `dismissed` resolves when the native sheet is gone. */
export type ReadOutcome =
  | { ok: true; result: CardResult; dismissed: Promise<void> }
  | { ok: false; error: CardReadError; dismissed: Promise<void> };

/**
 * Prompt the user to tap a card, run get_pkeys, validate the response, and
 * return the primary ETH address.
 *
 * `onTagDetected` fires the moment IsoDep connects (scanning → reading).
 * `opts.transport` is a test-injection seam; production callers omit it.
 */
export async function readCardAddress(
  onTagDetected?: (tag: TagEvent | null) => void,
  opts: { transport?: NfcTransport } = {},
): Promise<ReadOutcome> {
  const outcome = await runIsoDepSession<ValidatedPkeys>(
    // execHaloCmdRN runs while the IsoDep session is active (the session owner
    // guarantees it). It owns SELECT + the get_pkeys APDU; we validate its
    // untyped (`any`) return at the boundary before trusting any field.
    async () => validateGetPkeysResponse(await execHaloCmdRN(NfcManagerDefault, { name: 'get_pkeys' })),
    { transport: opts.transport, onTagDetected },
  );

  if (!outcome.ok) {
    return outcome;
  }

  // Product mapping (slot policy) runs after the session succeeds. readCardAddress
  // must still never throw — convert any failure here into an error outcome so
  // the caller always gets a { ok, dismissed } pair.
  try {
    const validated = outcome.result;
    const slot = pickPrimarySlot(validated.etherAddresses);
    return {
      ok: true,
      result: { address: validated.etherAddresses[slot], keySlot: slot },
      dismissed: outcome.dismissed,
    };
  } catch (e) {
    const error = e instanceof CardReadError ? e : new CardReadError('Failed to read the card.', 'read-failed', e);
    return { ok: false, error, dismissed: outcome.dismissed };
  }
}
