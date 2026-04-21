/**
 * Controllable fake of `@arx-research/libhalo/api/react-native` for unit tests.
 * The real `execHaloCmdRN` returns `Promise<any>`; tests configure the mock's
 * resolved value (a get_pkeys fixture or a thrown HaloLogicError/HaloTagError).
 */
import { vi } from 'vitest';

export const execHaloCmdRN = vi.fn(
  (_nfcManager: unknown, _command: { name: string }) => Promise.resolve<unknown>({}),
);
