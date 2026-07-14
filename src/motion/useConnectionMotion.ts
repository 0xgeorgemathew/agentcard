/**
 * useConnectionMotion — the central state-to-motion mapping.
 *
 * This is the single source of truth that coordinates animation across the
 * entire screen. Instead of each component running unrelated `useEffect`
 * loops, every visual element (card, button, background lighting) derives its
 * style from the same set of shared values produced here.
 *
 * Architecture:
 *   app state (10 values) → visual phase (7 values) → shared progress values
 *
 * The app state machine is unchanged and remains the source of NFC truth.
 * The visual phase is a lossy projection of it for animation purposes. The
 * shared progress values are driven by the phase via Reanimated, so a single
 * state change ripples through the whole composition in lockstep.
 *
 * ── Connection-sequence choreography ──
 * The card is a fixed-dimension object with a single face that illuminates and
 * lifts through the connection sequence. Four phases:
 *
 *   Phase 1 (activating)  — button acknowledges press; card detects interaction.
 *   Phase 2 (scanning)    — rim-light pulse, soft forward depth; controlled energy.
 *   Phase 3 (verifying)   — success confirmation: trace energy bloom across the
 *                           antenna bundle; body brightens.
 *   Phase 4 (connected)   — card settles into its connected lighting and material.
 *
 * Progress value semantics (each 0..1 unless noted):
 *   scanActive     — 0 idle → 1 fully scanning (lifts card, focuses light)
 *   reading        — 0 searching → 1 reading public key (cools/precises the light)
 *   success        — 0 not-yet → 1 fully revealed (trace bloom, confirmation)
 *   settled        — 0 pre-connection → 1 connected layout (cools glass, quiet)
 *   dormancy       — 1 fully dormant (disconnected) → 0 fully awake. Drives the
 *                    card's size, contrast, and glow so it reads as secondary
 *                    hardware before connection and the hero after.
 *   errorPulse     — momentary 0→1→0 blip fired when an error appears
 *   energyWarm     — warm light energy (invitation / scanning source)
 *   energyCool     — cool light energy (connected depth / reading precision)
 *   fieldPulse     — continuous 0..1 sawtooth driving NFC field rings (animated
 *                    on the UI thread so it never triggers JS renders)
 *
 * All continuous loops are cancelled the instant they become irrelevant
 * (e.g. when entering scanning), and all timed transitions are interruptible
 * so rapid retries or cancellations cannot stack animations.
 */
import { useCallback, useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  useSharedValue,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

import { stateToPhase, type AppState, type VisualPhase } from '@/motion/phases';
export { stateToPhase };
export type { AppState, VisualPhase };

export type ConnectionMotion = {
  /** Current visual phase (also exposed for copy / progressive disclosure). */
  phase: VisualPhase;
  /** Raw shared values, for components that need direct access. */
  scanActive: SharedValue<number>;
  reading: SharedValue<number>;
  success: SharedValue<number>;
  settled: SharedValue<number>;
  /**
   * THE single driver for the entire success→connected card transformation.
   * 0 = not yet revealed (idle/scanning/reading).
   * Ramps 0→1 across verifying→connected in ONE continuous animation.
   * Drives card position, scale, and growth — so the whole transformation is
   * one motion, not several coordinated ones.
   */
  reveal: SharedValue<number>;
  /** 1 dormant (disconnected) → 0 awake. Drives card size/contrast/glow. */
  dormancy: SharedValue<number>;
  errorPulse: SharedValue<number>;
  energyWarm: SharedValue<number>;
  energyCool: SharedValue<number>;
  fieldPulse: SharedValue<number>;
  /** Fire a one-shot error pulse (card lowers, rim dims, then recovers). */
  fireErrorPulse: () => void;
  /** Whether decorative loops should run. */
  reduced: boolean;
};

/**
 * Drive a shared value toward a target with an interruptible transition.
 * Using cancelAnimation first prevents stacked animations during rapid retries.
 * Always uses the soft Motion.easeOut bezier for buttery transitions.
 */
function interruptibleTiming(
  sv: SharedValue<number>,
  target: number,
  duration: number,
) {
  'worklet';
  cancelAnimation(sv);
  sv.value = withTiming(target, { duration, easing: Easing.bezier(...Motion.easeOut) });
}

/**
 * Commit a scalar or an animation descriptor to a shared value. Routed through a
 * helper (like interruptibleTiming) so the direct `.value` mutation stays out of
 * the component body: Reanimated SharedValues are stable refs mutated via
 * `.value` by design, which react-hooks/immutability would otherwise flag at the
 * call site. `value` may be a plain number (instant set) or the number returned
 * by a Reanimated animation factory (withTiming/withSpring/withRepeat/...).
 * Worklet-safe.
 */
function setValue(sv: SharedValue<number>, value: number) {
  'worklet';
  sv.value = value;
}

const TIM = {
  scan: Motion.base,
  read: Motion.fast,
  success: Motion.slow,
  settle: Motion.slow + 160,
  error: Motion.base,
  warm: Motion.base,
  cool: Motion.slow + 60,
  // dormancy transitions — slow and gentle so the card never snaps dormant
  wake: Motion.base + 60,
  dorm: Motion.slow + 280,
};

export function useConnectionMotion(state: AppState): ConnectionMotion {
  const reduced = useReducedMotion();
  const phase = stateToPhase(state);

  // ── primary progress values (driven by phase) ──
  const scanActive = useSharedValue(0);
  const reading = useSharedValue(0);
  const success = useSharedValue(0);
  const settled = useSharedValue(0);
  const errorPulse = useSharedValue(0);

  // ── THE single reveal driver ──
  // One value that drives the ENTIRE success→connected card transformation:
  // position, scale, growth. Ramp 0→1 across verifying→connected
  // as one continuous animation. This eliminates the coordination problems that
  // came from having scanActive/success/settled each drive separate transforms.
  const reveal = useSharedValue(0);

  // ── card transformation values ──
  // dormancy: 1 when truly disconnected (card reads as dormant hardware),
  // 0 once the user engages or the card is connected.
  const dormancy = useSharedValue(1);

  // ── derived energy values (warm/cool lighting balance) ──
  const energyWarm = useSharedValue(0.5);
  const energyCool = useSharedValue(0.2);

  // ── continuous loops (UI thread, JS-render-free) ──
  const fieldPulse = useSharedValue(0);

  /**
   * Apply the phase to every progress value. This is the choreography: one
   * function that moves the whole composition together. Wrapped in a
   * useCallback so it is stable across renders.
   */
  const applyPhase = useCallback(
    (next: VisualPhase, opts: { reduced: boolean }) => {
      const r = opts.reduced;

      // Primary progress flags.
      const scanning = next === 'scanning';
      const readingP = next === 'reading';
      const verifying = next === 'verifying';
      const connected = next === 'connected';
      const idle = next === 'idle' || next === 'activating';

      // scanActive drives the halo/rim, the NFC field, AND the card's scan
      // lift (translateY). It stays at 1 through verifying+connected so the
      // halo doesn't flicker; the card's hero position/scale are driven by
      // `reveal`, which is independent of this value's transitions at the
      // connected boundary.
      interruptibleTiming(scanActive, scanning || readingP || verifying || connected ? 1 : 0, TIM.scan);
      interruptibleTiming(reading, readingP ? 1 : 0, TIM.read);

      // success: quick ramp at verifying so the trace energy bloom + body
      // brightening appear, holding through connected.
      interruptibleTiming(success, verifying || connected ? 1 : 0, TIM.success);
      interruptibleTiming(settled, connected ? 1 : 0, TIM.settle);

      // ── THE single reveal driver ──
      // reveal drives the ENTIRE card transformation (position, scale, growth)
      // as ONE continuous 0→1 motion. It starts at the connected
      // phase and rises via a highly-damped spring — decisive start, fluid
      // zero-bounce settle into the hero position, no elastic overshoot. Because
      // position/scale/growth all read from this single value, there are ZERO
      // coordination discontinuities: the card moves from its scan pose to its
      // hero pose in one continuous, magnetic-field-like lift.
      //
      // No explicit reset to 0 here: on every connected entry reveal is already
      // 0 (it eases to 0 across all prior phases), so the spring starts from 0
      // on the happy path. Omitting the reset means a re-run of applyPhase while
      // already connected (e.g. a Reduced Motion toggle mid-connect) re-springs
      // from reveal's current value instead of snapping back to 0 and bouncing.
      //
      // Reduced Motion replaces the spring with a short, non-bouncy timing so
      // the connected feedback still reads without extended motion.
      cancelAnimation(reveal);
      if (connected) {
        if (r) {
          setValue(reveal, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
        } else {
          setValue(reveal, withSpring(1, Motion.springRise));
        }
      } else {
        setValue(reveal, withTiming(0, {
          duration: r ? 120 : Motion.base,
          easing: Easing.out(Easing.cubic),
        }));
      }

      // ── dormancy: card reads as dormant only when truly idle ──
      interruptibleTiming(dormancy, next === 'idle' ? 1 : 0, next === 'idle' ? TIM.dorm : TIM.wake);

      // Warm/cool balance.
      const warmTarget = idle ? 0.55 : scanning ? 0.85 : readingP ? 0.3 : verifying ? 0.2 : 0.2;
      const coolTarget = idle ? 0.2 : scanning ? 0.25 : readingP ? 0.55 : verifying ? 0.7 : 0.85;
      interruptibleTiming(energyWarm, warmTarget, TIM.warm);
      interruptibleTiming(energyCool, coolTarget, TIM.cool);

      // NFC field pulse loop — only while scanning. EVERYWHERE else the pulse
      // EASES to its target, never an instant scalar set: cancelAnimation freezes
      // the scan loop at an arbitrary value, and a bare `setValue(fieldPulse, x)`
      // would discard that and snap the rings in one frame (they are at full
      // strength the instant reading/error begin). The timing starts from the
      // frozen value, so the field reads as smoothly settling / dissolving.
      cancelAnimation(fieldPulse);
      const pulseSettle = { duration: 160, easing: Easing.out(Easing.cubic) };
      if (r) {
        setValue(fieldPulse, 0);
      } else if (scanning) {
        setValue(fieldPulse, 0);
        // One outward ripple per beat. A single 0→1 rise (explosive ease-out)
        // carries the ring out + fades it; then a ~1ms (sub-frame) reset back to
        // 0, then a rest. The sub-frame reset is never rendered, so — unlike a
        // 0→1→0 sawtooth — there is no contract-then-re-brighten: each ring reads
        // as "shoot out, hang, fade", never "expand then implode".
        setValue(fieldPulse, withRepeat(
          withSequence(
            withTiming(1, { duration: Motion.scanPulseMs * 0.55, easing: Easing.bezier(...Motion.easeExplosive) }),
            withTiming(0, { duration: 1 }),
            withTiming(0, { duration: Motion.scanPulseMs * 0.40 })
          ),
          -1,
          false
        ));
      } else if (readingP) {
        // Card acquired — ease the ripple down to a faint hold instead of
        // snapping to it. The ring `visible` term (driven by `reading`) dims in
        // parallel, so the field reads as settling, not freezing mid-expansion.
        setValue(fieldPulse, withTiming(0.15, pulseSettle));
      } else {
        // Verifying / connected / idle / error — dissolve the field smoothly
        // (covers reading→verifying 0.15→0 and scanning→error loop→0).
        setValue(fieldPulse, withTiming(0, pulseSettle));
      }
    },
    [
      scanActive,
      reading,
      success,
      settled,
      reveal,
      dormancy,
      energyWarm,
      energyCool,
      fieldPulse,
    ]
  );

  // Drive the phase whenever state (or reduced-motion) changes.
  useEffect(() => {
    applyPhase(phase, { reduced });
  }, [phase, reduced, applyPhase]);

  const fireErrorPulse = useCallback(() => {
    'worklet';
    // A brief mechanical rejection: a fast damped dip to 1, then a critically
    // damped recovery to 0. Springs (not timings) give the physical flinch;
    // overshoot is clamped on both halves so it never bounces or shakes.
    cancelAnimation(errorPulse);
    setValue(errorPulse, 0);
    setValue(errorPulse, withSequence(
      withSpring(1, Motion.springFlinchIn),
      withSpring(0, Motion.springFlinchOut),
    ));
  }, [errorPulse]);

  return {
    phase,
    scanActive,
    reading,
    success,
    settled,
    reveal,
    dormancy,
    errorPulse,
    energyWarm,
    energyCool,
    fieldPulse,
    fireErrorPulse,
    reduced,
  };
}
