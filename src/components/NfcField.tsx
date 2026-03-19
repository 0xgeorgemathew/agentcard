/**
 * NfcField — the energized field glow that belongs to the card.
 *
 * Per the spec, the NFC visualization must not be a large generic icon
 * floating separately from the card. It belongs to the card and reacts to the
 * card's surface. This component renders concentric field rings that expand
 * outward around the card, driven entirely by the shared `fieldPulse` value
 * from the motion system.
 *
 * The rings are rounded rectangles that echo the card's own shape and corner
 * radius, sized to the card's actual aspect ratio. They originate from the
 * antenna trace bundle hugging the card's perimeter (the "copper wires") and
 * expand outward along that same rounded-rect geometry — so the field reads as
 * radiating from the wires themselves, not as a generic circular NFC icon. The
 * glow color is provided by the parent as a variant-specific accent.
 *
 * Behaviour by phase:
 *   idle     — rings hidden (the idle invitation is handled by the card rim).
 *   scanning — a clear, single rhythm: field expands, environment responds,
 *              field disappears, short rest. Repeats without fake progress.
 *   reading  — motion sharply reduced (the card has been acquired).
 *   connected/else — hidden.
 *
 * The parent passes the shared values it already owns so this component never
 * starts its own loops and never causes JS renders.
 */
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';

import { clamp01 } from '@/motion/worklets';

type Props = {
  /** Continuous 0..1 field pulse from the motion system. */
  fieldPulse: SharedValue<number>;
  /** Scan progress (rings only render while > 0). */
  scanActive: SharedValue<number>;
  /** Reading progress — reduces ring travel when the card is acquired. */
  reading: SharedValue<number>;
  /** Settled (connected) — fully hides the field. */
  settled: SharedValue<number>;
  /** Card width, so rings are sized relative to the card. */
  cardWidth: number;
  /** Card height — the card is portrait (taller than wide). */
  cardHeight: number;
  /** Variant-specific accent color used for the energized ring glow. */
  glowColor: string;
  reduced: boolean;
};

// Corner radius shared between all rings. Slightly rounder than the card body
// (20) so each ring reads as a soft concentric echo of the card's own silhouette
// as it radiates outward from the antenna traces that hug that same perimeter.
const RING_RADIUS = 24;

export function NfcField({
  fieldPulse,
  scanActive,
  reading,
  settled,
  cardWidth,
  cardHeight,
  glowColor,
  reduced,
}: Props) {
  return (
    <View style={styles.host} pointerEvents="none">
      <Ring fieldPulse={fieldPulse} scanActive={scanActive} reading={reading} settled={settled}
        width={cardWidth} height={cardHeight} glowColor={glowColor}
        offset={0} maxScale={1.2} baseOpacity={0.5} reduced={reduced} />
      <Ring fieldPulse={fieldPulse} scanActive={scanActive} reading={reading} settled={settled}
        width={cardWidth} height={cardHeight} glowColor={glowColor}
        offset={0.18} maxScale={1.4} baseOpacity={0.35} reduced={reduced} />
      <Ring fieldPulse={fieldPulse} scanActive={scanActive} reading={reading} settled={settled}
        width={cardWidth} height={cardHeight} glowColor={glowColor}
        offset={0.36} maxScale={1.6} baseOpacity={0.22} reduced={reduced} />
    </View>
  );
}

/** A single concentric field ring. Calls its hook at the top level. */
function Ring({
  fieldPulse,
  scanActive,
  reading,
  settled,
  width,
  height,
  glowColor,
  offset,
  maxScale,
  baseOpacity,
  reduced,
}: {
  fieldPulse: SharedValue<number>;
  scanActive: SharedValue<number>;
  reading: SharedValue<number>;
  settled: SharedValue<number>;
  width: number;
  height: number;
  glowColor: string;
  offset: number;
  maxScale: number;
  baseOpacity: number;
  reduced: boolean;
}) {
  // The animated wrapper carries the temporal envelope (pulse in/out + phase
  // visibility) and the outward scale. The two static border layers inside carry
  // the per-ring brightness and the sharp-line-over-soft-glow look — asymmetric
  // brightness falloff so the ring reads as an energy stroke, not a neon outline.
  const style = useAnimatedStyle(() => {
    const p = fieldPulse.value;
    // each ring lags the previous by offset, clamped 0..1
    const local = clamp01(p - offset);
    const scanning = scanActive.value;
    const acquired = reading.value;
    const stable = settled.value;

    // hide entirely once connected or mostly acquired (reading precision)
    const visible = scanning * (1 - acquired * 0.7) * (1 - stable);
    if (visible <= 0.01) return { opacity: 0, transform: [{ scale: 0 }] };

    // The ring reaches full extension over the first half of the beat, then
    // HOLDS at max (the "hang"). Opacity brightens on emergence and fades while
    // the ring hangs at full size — a single outward ripple. Driven by the
    // one-way fieldPulse (rise + sub-frame reset), so there is no contraction.
    const scale = interpolate(local, [0, 0.5], [0.92, maxScale], 'clamp');
    const envelope = interpolate(local, [0, 0.1, 0.4, 1], [0, 1, 1, 0]) * visible;
    return {
      opacity: reduced ? 0.5 * visible : envelope,
      transform: [{ scale: reduced ? 1 : scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ringWrap,
        { width, height, borderRadius: RING_RADIUS },
        style,
      ]}
    >
      {/* wider, lower-opacity variant glow underneath — the soft bloom */}
      <View
        style={[
          styles.ringGlow,
          {
            borderRadius: RING_RADIUS,
            borderColor: glowColor,
            shadowColor: glowColor,
            opacity: Math.min(baseOpacity * 0.8, 0.9),
          },
        ]}
      />
      {/* sharper, brighter inner line on top — the crisp stroke */}
      <View
        style={[
          styles.ringLine,
          { borderRadius: RING_RADIUS, borderColor: glowColor, opacity: Math.min(baseOpacity * 1.9, 0.95) },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The animated wrapper — sized to the card aspect, centered on the card.
  ringWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Soft bloom: a wider, lower-opacity border + a gentle outer glow shadow.
  ringGlow: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2.5,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  // Crisp inner stroke: thin, brighter, no shadow — keeps the ring elegant.
  ringLine: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
  },
});
