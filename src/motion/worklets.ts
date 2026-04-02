/**
 * Shared Reanimated worklet helpers.
 *
 * Small worklet utilities used by more than one animated component. Each
 * function carries the `'worklet'` directive so Reanimated's babel plugin
 * marks it runnable on the UI thread even when imported from another module.
 */

/** Clamp a number to the 0..1 range. Worklet-safe. */
export function clamp01(n: number): number {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
