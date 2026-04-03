/**
 * Pure application-state → visual-phase projection, extracted from
 * useConnectionMotion so the state machine's lossy mapping is unit-testable
 * without a React Native / Reanimated environment.
 *
 * The app-state union is the source of truth for the connection flow; the
 * visual phase is a 7-value lossy projection used only to drive animation.
 */

/** The seven visual phases derived from the ten application states. */
export type VisualPhase =
  | 'idle'
  | 'activating'
  | 'scanning'
  | 'reading'
  | 'verifying'
  | 'connected'
  | 'error';

/** Application states — the single source of truth for the connection state machine. */
export type AppState =
  | 'disconnected'
  | 'preparingToScan'
  | 'scanning'
  | 'reading'
  | 'success'
  | 'connected'
  | 'cancelled'
  | 'timedOut'
  | 'unsupportedCard'
  | 'connectionFailed';

/** Map an application state to a visual phase. Pure; safe to call per render. */
export function stateToPhase(state: AppState): VisualPhase {
  switch (state) {
    case 'disconnected':
    case 'cancelled':
      return 'idle';
    case 'preparingToScan':
      return 'activating';
    case 'scanning':
      return 'scanning';
    case 'reading':
      return 'reading';
    case 'success':
      return 'verifying';
    case 'connected':
      return 'connected';
    case 'timedOut':
    case 'unsupportedCard':
    case 'connectionFailed':
      return 'error';
  }
}
