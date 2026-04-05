import { describe, it, expect } from 'vitest';
import { stateToPhase, type AppState, type VisualPhase } from './phases';

const EXPECTED: Record<AppState, VisualPhase> = {
  disconnected: 'idle',
  cancelled: 'idle',
  preparingToScan: 'activating',
  scanning: 'scanning',
  reading: 'reading',
  success: 'verifying',
  connected: 'connected',
  timedOut: 'error',
  unsupportedCard: 'error',
  connectionFailed: 'error',
};

describe('stateToPhase (exhaustive mapping)', () => {
  (Object.keys(EXPECTED) as AppState[]).forEach((state) => {
    it(`maps ${state} → ${EXPECTED[state]}`, () => {
      expect(stateToPhase(state)).toBe(EXPECTED[state]);
    });
  });

  it('covers all 10 application states (no unmapped state)', () => {
    const states = Object.keys(EXPECTED) as AppState[];
    expect(states).toHaveLength(10);
    states.forEach((s) => expect(() => stateToPhase(s)).not.toThrow());
  });
});
