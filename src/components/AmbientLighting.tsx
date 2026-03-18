/**
 * AmbientLighting — the state-reactive background for the warm BurnerOS canvas.
 *
 * The page background is a warm cream (`Palette.bg`), and this layer adds
 * SUBTLE pastel washes on top of it — bright and airy, never dark glows. The
 * translucent Burner card body lets these washes bleed through, so the
 * background is part of the choreography:
 *
 *   idle     — a soft peach halo drifts gently above the card; a faint
 *              acid-lime depth rests below.
 *   scanning — the warm light contracts and concentrates upward toward the
 *              NFC target.
 *   connected— warm settles; the acid depth strengthens (settled, alive).
 *
 * Softness comes from a large `shadowRadius` cast by a transparent body — no
 * expo-linear-gradient, no expo-blur (neither is available on iOS 16.4). Under
 * Reduced Motion the fields are static but still present, so the warm/acid
 * spatial structure always reads.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  interpolate,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { Palette } from '@/constants/theme';

type Props = {
  energyWarm: SharedValue<number>;
  energyCool: SharedValue<number>;
  scanActive: SharedValue<number>;
};

export function AmbientLighting({ energyWarm, energyCool, scanActive }: Props) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);

  // Extremely slow ambient drift of the warm field. This is the only continuous
  // loop in the background, and it is deliberately so slow (~24s per cycle) that
  // it reads as a living atmosphere rather than visible motion. The spec calls
  // for a completely still Stage 1 — the background must not compete with the
  // dormant card or the Connect button.
  useEffect(() => {
    if (reduced) return;
    drift.value = 0;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 12000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(drift);
  }, [reduced, drift]);

  // Warm field — upper area, where the card lives. A soft peach pastel wash.
  // Contracts upward + scales down toward the target as scanning intensifies,
  // concentrating the warm light on the NFC tap point.
  const warm = useAnimatedStyle(() => {
    const dx = interpolate(drift.value, [0, 1], [-10, 10]);
    const dy = interpolate(drift.value, [0, 1], [-4, 4]);
    const concentrating = scanActive.value; // 0 idle → 1 scanning
    return {
      transform: [
        { translateX: dx },
        { translateY: dy + interpolate(concentrating, [0, 1], [0, 30]) },
        { scale: interpolate(concentrating, [0, 1], [1, 0.85]) },
      ],
      opacity: interpolate(energyWarm.value, [0, 1], [0.25, 0.8]),
    };
  });

  // Acid/cool field — lower area, depth. A faint acid-lime wash that
  // strengthens as the connection settles, keeping the canvas feeling alive
  // rather than cooling toward blue.
  const cool = useAnimatedStyle(() => {
    const dx = interpolate(drift.value, [0, 1], [8, -8]);
    return {
      transform: [{ translateX: dx }, { translateY: interpolate(drift.value, [0, 1], [4, -4]) }],
      opacity: interpolate(energyCool.value, [0, 1], [0.15, 0.6]),
    };
  });

  // Softening field — a near-white wash that lifts the mid-canvas ever so
  // slightly, keeping the cream background bright and airy. Very faint; driven
  // by the cool curve as a cheap proxy for "settled".
  const soft = useAnimatedStyle(() => {
    const settled = interpolate(energyCool.value, [0.2, 0.6], [0, 1], 'clamp');
    return {
      opacity: interpolate(settled, [0, 1], [0, 0.35]),
      transform: [{ scale: interpolate(settled, [0, 1], [0.92, 1.04]) }],
    };
  });

  return (
    <View style={styles.host} pointerEvents="none">
      <Animated.View style={[styles.field, styles.warmField, warm]} />
      <Animated.View style={[styles.field, styles.coolField, cool]} />
      <Animated.View style={[styles.field, styles.softField, soft]} />
    </View>
  );
}

const HALO = 560;

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  field: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: 'transparent',
  },
  // Warm peach pastel wash — upper area, softens the cream above the card.
  warmField: {
    top: -190,
    alignSelf: 'center',
    shadowColor: '#FFD9A8',
    shadowOpacity: 0.22,
    shadowRadius: 190,
    shadowOffset: { width: 0, height: 0 },
  },
  // Faint acid-lime wash — lower area, ties the canvas to the Acid accent.
  coolField: {
    bottom: -260,
    alignSelf: 'center',
    shadowColor: Palette.acid,
    shadowOpacity: 0.14,
    shadowRadius: 200,
    shadowOffset: { width: 0, height: 0 },
  },
  // Near-white softening wash — mid-canvas lift to keep things bright.
  softField: {
    top: '30%',
    alignSelf: 'center',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.18,
    shadowRadius: 170,
    shadowOffset: { width: 0, height: 0 },
  },
});
