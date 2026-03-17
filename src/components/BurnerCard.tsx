/**
 * BurnerCard — the single continuous card object.
 *
 * ONE card. ONE face. Mounted across every state, never replaced, never
 * remounted, never key-swapped. The card you see before connection IS the card
 * you see after connection — it powers on (traces energize, body brightens,
 * scale grows) but never changes structure or identity.
 *
 * ── Physical reconstruction ──
 * A portrait slab of saturated translucent tinted acrylic (the variant color),
 * with five thin, closely-spaced, nested rounded-rectangle antenna traces
 * running around the perimeter. Their lower horizontal runs are concealed
 * behind a light cream opaque insert panel that occupies the lower portion of
 * the card. Printed on the body: a serif "Burner" wordmark, a small serial
 * identifier, and the two-line phrase "Ethereum in / your pocket." Printed on
 * the panel: a square concentric-arc contactless mark drawn from Views.
 *
 * ── How the transformation works (the simple model, preserved) ──
 * The card has FIXED dimensions. The entire success→connected transformation
 * is driven by ONE shared value, `reveal` (0→1), which animates as a single
 * continuous motion. Position, scale, and growth all derive from `reveal` —
 * so there are ZERO coordination discontinuities.
 *
 *   scanActive(0→1)  card rises during scanning (drives translateY) + halo/field
 *   reveal    (0→1)  THE single driver: position + scale + growth
 *   success   (0→1)  trace energy bloom (quick ramp at verifying)
 *   dormancy  (1→0)  depth scale recovers, body brightens (idle→awake)
 *
 * What the user sees:
 *   idle      — card sits low, small, dormant, traces subdued
 *   scanning  — card rises (scanActive → translateY); traces brighten
 *   verifying — trace energy bloom across the antenna bundle (success → 1)
 *   connected — reveal ramps 0→1: card scales up, shifts to hero position,
 *               traces settle into a stable energized state
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  interpolateColor,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { Palette, Motion, CARD_VARIANTS, DEFAULT_VARIANT, PANEL, WIRE, type CardVariant } from '@/constants/theme';
import type { VisualPhase } from '@/motion/useConnectionMotion';
import { clamp01 } from '@/motion/worklets';
import { NfcField } from '@/components/NfcField';
import { StatusMark } from '@/components/StatusMark';

type Props = {
  /** Shared motion values from the central hook. */
  scanActive: SharedValue<number>;
  reading: SharedValue<number>;
  success: SharedValue<number>;
  settled: SharedValue<number>;
  /** THE single driver for the entire card transformation (0→1). */
  reveal: SharedValue<number>;
  /** 1 dormant → 0 awake. Drives depth scale, contrast, glow. */
  dormancy: SharedValue<number>;
  /** Continuous NFC field pulse (scanning rhythm) from the motion hook. */
  fieldPulse: SharedValue<number>;
  errorPulse: SharedValue<number>;
  /** Current visual phase — used to start/stop the connected ambient shimmer. */
  phase: VisualPhase;
  /** Card color variant. Defaults to Acid. */
  variant?: CardVariant['name'];
};

// FIXED card dimensions — portrait, per the physical product. The "growth" is a
// pure scale transform driven by `reveal` — no width/height animation, no
// layout reflow, no jumps. Starting values from the spec, tuned for iPhone.
const CARD_W = 168;
const CARD_H = 258;

// The coloured energy halo extends this far beyond the card on every side. The
// halo View is positioned absolute inside cardWrap (which shrink-wraps the
// card), so it anchors at the card's top-left — the negative top/left insets
// here re-center it on the card. Named so the centering cannot drift from the
// size.
const HALO_BLEED = 28;

// Scale regimes: dormant (idle) → awake (scanning) → hero (connected).
// All applied as a single transform scale.
const SCALE_DORMANT = 0.88;
const SCALE_AWAKE = 1.0;
const SCALE_HERO = 1.34;

// Sheet-clear lift — extra upward translateY applied ONLY while the native iOS
// NFC sheet is open (scanning/reading), so the system UI cannot cover the card.
// Gated to the sheet-open window inside cardWrap (see `sheetOpen`). Sized for
// modern iPhones — the card clears the sheet while still clearing the header.
// Single tunable knob: raise it if a given device's sheet is taller.
const SHEET_CLEAR_LIFT = 140;

// Antenna traces: five nested rounded rectangles matching the physical card's
// five copper wires. Each is inset from the card edge by a uniform step and
// drawn full (all four sides) BEHIND the opaque panel; the panel naturally
// conceals their lower horizontal runs. This is more robust than drawing
// disconnected three-sided borders (no awkward endpoints).
// The traces are a TIGHT bundle (2px step) hugging the outer third of the card,
// matching the physical card where the five wires sit close together.
const TRACE_COUNT = 5;
const TRACE_INSET_START = 12; // outermost trace inset from card edge (px)
const TRACE_STEP = 2; // spacing between nested traces — tight bundle
const TRACE_THICKNESS = 0.7; // fine wire gauge — thin, delicate traces
// Outermost trace corner radius. Each inner trace's radius steps DOWN by
// TRACE_STEP so the corner arcs share their centres (concentric). That is what
// keeps the wires a uniform TRACE_STEP apart right around the corners — a
// constant radius would fan them ~2.8px apart at the 45° diagonal vs 2px on the
// straights, the "too far apart in the corners" artefact.
const TRACE_RADIUS_BASE = 16;

// Deboss etch — each antenna trace is drawn as THREE concentric layered strokes
// so the wire reads as cast INTO the acrylic rather than printed on top: a faint
// warm-light refraction on the outer lip, the copper wire in the groove, and a
// darker shadow on the inner wall. The offset is NORMAL (perpendicular to every
// edge), applied by growing/shrinking the whole rect — NOT a vertical shift —
// so the composite band is a uniform thickness on all four sides + corners. A
// vertical-only offset would fatten only the horizontal runs (see traceLayers).
const DEBOSS_LIGHT_OFFSET = 0.2; // light refraction sits ~0.2px OUTSIDE the wire
const DEBOSS_SHADOW_OFFSET = 0.25; // etch shadow sits ~0.25px INSIDE the wire

// Milky internal veil — a restrained warm scatter over the body fill, suggesting
// light diffusing through the translucent acrylic without washing out the tint.
// Low enough alpha that the Acid colour keeps full presence and visual weight.
const VEIL_COLOR = 'rgba(255, 248, 230, 0.045)';

// Opaque lower panel — light cream insert. Short and wide, matching the
// reference card (~29% of card height, ~94% of card width). Wide enough to
// cover the lower horizontal runs of all five antenna traces; short enough to
// leave the transparent body dominant.
const PANEL_INSET_X = 5; // left/right margin inside the card (~94% width)
const PANEL_BOTTOM_MARGIN = 10; // strip of acrylic below the panel
const PANEL_HEIGHT = 76; // ~29% of card height

/**
 * The connected surface sweep, approximated as a soft diagonal band of
 * OVERLAPPING translucent strips (no gradient dependency available). Each strip
 * slides under the next by SHIMMER_OVERLAP of its width, so neighbouring
 * translucent regions composite into a smooth cross-section with transparent
 * edges and a faint warm centre — no hard internal seams. Per-strip opacities
 * are kept low because overlap accumulates alpha toward the centre.
 */
const SHIMMER_OVERLAP = 0.5; // each strip overlaps the previous by half its width
const SHIMMER_STRIPS: { w: number; o: number }[] = [
  { w: 16, o: 0.02 },
  { w: 18, o: 0.035 },
  { w: 20, o: 0.05 },
  { w: 22, o: 0.058 },
  { w: 20, o: 0.05 },
  { w: 18, o: 0.035 },
  { w: 16, o: 0.02 },
];
// Band width = the first strip's full width + each later strip's exposed width.
const SHIMMER_BAND_WIDTH = SHIMMER_STRIPS.reduce(
  (s, x, i) => s + (i === 0 ? x.w : x.w * (1 - SHIMMER_OVERLAP)),
  0,
);

export function BurnerCard({
  scanActive,
  reading,
  success,
  settled,
  reveal,
  dormancy,
  fieldPulse,
  errorPulse,
  phase,
  variant = DEFAULT_VARIANT,
}: Props) {
  const reduced = useReducedMotion();
  const cv = CARD_VARIANTS[variant];

  // Debossed trace layers — static, memoized so we never rebuild them per frame.
  // Each of the five nested rounded rectangles becomes three strokes (light /
  // wire / shadow) offset vertically by sub-pixel amounts. Corner radii step
  // down per trace (concentric arcs) so the bundle reads as uniformly spaced.
  const traceLayers = useMemo(() => {
    const arr: {
      top: number;
      left: number;
      w: number;
      h: number;
      radius: number;
      color: string;
      opacity: number;
    }[] = [];
    for (let i = 0; i < TRACE_COUNT; i++) {
      const inset = TRACE_INSET_START + i * TRACE_STEP;
      // Step the corner radius down with each inner trace so the arcs share a
      // centre (concentric) — uniform spacing everywhere, corners included.
      const radius = TRACE_RADIUS_BASE - i * TRACE_STEP;
      // Three CONCENTRIC strokes: light on the OUTER lip (a slightly larger
      // rect), the copper wire, shadow on the INNER wall (a slightly smaller
      // rect). `radius - d` holds the corner-arc centre fixed across all three,
      // so each is a true normal offset of the wire and the band stays ONE
      // thickness on every edge. A vertical-only shift (old approach) spread
      // these apart only across the horizontal runs, making the top edge render
      // thicker than the sides.
      const deboss = [
        { d: -DEBOSS_LIGHT_OFFSET, color: WIRE.debossLight, opacity: 1 },
        { d: 0, color: WIRE.dormant, opacity: 0.72 },
        { d: DEBOSS_SHADOW_OFFSET, color: WIRE.debossShadow, opacity: 1 },
      ];
      for (const { d, color, opacity } of deboss) {
        const ins = inset + d; // d < 0 => larger (outer) rect, d > 0 => smaller (inner)
        arr.push({
          top: ins,
          left: ins,
          w: CARD_W - ins * 2,
          h: CARD_H - ins * 2,
          radius: radius - d, // keeps the arc centre identical across all three
          color,
          opacity,
        });
      }
    }
    return arr;
  }, []);

  // The only continuous loop: an extremely slow, faint material shimmer that
  // runs ONLY when connected.
  const connectedShimmer = useSharedValue(-1);
  const isConnected = phase === 'connected';

  useEffect(() => {
    if (reduced || !isConnected) {
      connectedShimmer.value = -1;
      return;
    }
    const run = () => {
      connectedShimmer.value = -0.4;
      connectedShimmer.value = withTiming(1.4, {
        duration: Motion.sweepMs,
        easing: Easing.inOut(Easing.cubic),
      });
    };
    const t1 = setTimeout(run, 800);
    const id = setInterval(run, Motion.sweepMs + 9000);
    return () => {
      clearTimeout(t1);
      clearInterval(id);
    };
  }, [reduced, isConnected, connectedShimmer]);

  // ── THE whole-card transform: ONE value, ONE motion (preserved) ──
  // Position (translateY) and scale BOTH derive from `reveal` (plus scanActive
  // for the initial scan rise and dormancy for the idle depth). Because reveal
  // is a single animation ramping 0→1, the entire transformation is continuous.
  //
  // Position story (recalibrated for the taller portrait card):
  //   idle      — dormOffsetY pushes card down (near Connect button)
  //   scanning  — scanActive raises it, AND a sheet-clear lift floats it above
  //               the native iOS NFC sheet (open only while scanning/reading)
  //   connected — reveal shifts it UP to the hero position (UNCHANGED by the
  //               sheet-clear term, which is 0 once the sheet has closed)
  const cardWrap = useAnimatedStyle(() => {
    const dorm = dormancy.value;
    const rev = reveal.value;

    const depthScale = interpolate(dorm, [0, 1], [1, SCALE_DORMANT]);
    const heroScale = interpolate(rev, [0, 1], [SCALE_AWAKE, SCALE_HERO]);

    // Scan lift + hero position, blended so reveal takes over smoothly.
    const scanLiftY = interpolate(scanActive.value, [0, 1], [0, -36]);
    const heroY = -56;
    const y = scanLiftY * (1 - rev) + heroY * rev;

    // Dormant offset (card sits lower when idle) — taller card, larger offset.
    const dormOffsetY = interpolate(dorm, [0, 1], [0, 96]);

    // Sheet-clear lift — float the card clear of the native iOS NFC sheet while
    // it is open (scanning/reading), AND hold the card at that raised height
    // through the verifying beat so the StatusMark can morph hourglass→tick on a
    // STILL card. The lift releases ONLY as part of the connected `reveal`,
    // which then carries the card's entire raised→hero descent in one motion.
    // So the beat reads: sheet dismisses → card HOLDS → icon morphs → card
    // settles into hero — the card never moves while the icon is morphing.
    //   The lift is gated by (scanActive − reveal), NOT (scanActive − success):
    //   success ramps at verifying (energizing the traces, pairing with the
    //   tick), but the card must NOT descend then. reveal stays 0 through
    //   verifying and only rises at connected, so (scanActive − reveal) is 1
    //   across scanning/reading/verifying and falls to 0 inside the reveal. On
    //   disconnect reveal eases out (cubic) no faster than scanActive (bezier
    //   easeOut), so the difference stays ≤ 0 and clamps to 0 — no upward bump.
    const sheetOpen = clamp01(scanActive.value - reveal.value);
    const sheetClearY = sheetOpen * SHEET_CLEAR_LIFT;

    // Error nudge.
    const errY = interpolate(errorPulse.value, [0, 1], [0, 8]);
    const errScale = interpolate(errorPulse.value, [0, 1], [1, 0.99]);

    return {
      transform: [
        { translateY: y + dormOffsetY + errY - sheetClearY },
        { scale: depthScale * heroScale * errScale },
      ],
    };
  });

  // Card body fill: dormant (dimmer tint) → awake (full saturated tint) →
  // connected (brightest). Colored acrylic, never opaque, never invisible.
  const bodyStyle = useAnimatedStyle(() => {
    const dorm = dormancy.value;
    const energy = Math.max(scanActive.value, reading.value, success.value, settled.value, reveal.value);
    // Blend body → bodyAwake as the card energizes; recede toward a dimmer tint when dormant.
    const bg = interpolateColor(
      dorm,
      [0, 1],
      [interpolateColor(energy, [0, 1], [cv.body, cv.bodyAwake]), cv.body]
    );
    return { backgroundColor: bg };
  });

  // A controlled "energy pass" through the five traces on success — elegant and
  // one-shot, never an infinite pulse — PLUS a restrained persistent edge glow
  // once connected, so the traces stay quietly energized circuitry (never neon).
  const energyPass = useAnimatedStyle(() => {
    const s = success.value;
    const wave = interpolate(s, [0, 0.5, 1], [0, 0.5, 0.18]); // one-shot success bloom
    const connectedness = Math.max(settled.value, reveal.value);
    const glow = Math.max(wave, connectedness * 0.14); // quiet resting edge glow
    return {
      shadowColor: cv.traceGlow,
      shadowOpacity: glow,
      // shadowRadius held static so iOS rasterizes the blur once; only opacity
      // animates per frame (the cheap path).
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      opacity: glow > 0.02 ? 1 : 0,
    };
  });

  // Trace definition — the debossed bundle reads as inert, faintly-embedded
  // circuitry when dormant and gently sharpens its presence as the card
  // energizes. A subtle opacity lift only; the traces never turn bright.
  const traceDefStyle = useAnimatedStyle(() => {
    const e = Math.max(scanActive.value, reading.value, settled.value, reveal.value);
    return { opacity: interpolate(e, [0, 1], [0.78, 1]) };
  });

  // Coloured energy glow behind the card. Dormant = barely visible; scanning/
  // reading = focused accent; connected = a quiet, widened, stable halo (never a
  // continuous pulse). It widens as the card rises.
  const haloStyle = useAnimatedStyle(() => {
    const dorm = dormancy.value;
    const rim = scanActive.value * 0.7 + reading.value * 0.3;
    const connectedness = Math.max(success.value, settled.value, reveal.value);
    const errLoss = errorPulse.value;
    // Scanning/reading give a focused bright halo that hands off, as the card
    // connects, to a quieter resting glow.
    const focus = rim * (1 - connectedness * 0.9);
    const stable = connectedness * 0.28;
    const intensity = clamp01((focus + stable - errLoss * 0.6) * (1 - dorm * 0.8));
    const haloScale = interpolate(reveal.value, [0, 1], [1, 1.2]);
    return {
      opacity: interpolate(intensity, [0, 1], [0.05, 0.8]),
      shadowColor: cv.traceGlow,
      shadowOpacity: interpolate(intensity, [0, 1], [0.05, 0.45]),
      // shadowRadius held static (iOS rasterizes the blur once); the halo's
      // widening as the card rises comes from the cheap scale transform below.
      shadowRadius: 34,
      shadowOffset: { width: 0, height: 0 },
      transform: [{ scale: interpolate(intensity, [0, 1], [0.94, 1.05]) * haloScale }],
    };
  });

  // Tight contact shadow — directly beneath the card, reading as near-contact
  // with the surface. Strongest while idle; softens and separates as the card
  // rises. (Sibling of the card: RN allows only one shadow per View.)
  const contactShadowStyle = useAnimatedStyle(() => {
    const lift = Math.max(scanActive.value, reveal.value);
    return {
      shadowColor: Palette.ink,
      shadowOpacity: interpolate(lift, [0, 1], [0.2, 0.09]),
      // shadowRadius static (blur rasterizes once); softening as the card rises
      // reads through opacity, separation through the offset below.
      shadowRadius: 7,
      shadowOffset: { width: 0, height: interpolate(lift, [0, 1], [3, 7]) },
    };
  });

  // Broader suspension shadow — the float. Reduced from the old single shadow so
  // it no longer competes with the contact layer; its offset grows with the lift
  // to reinforce the card's changing distance from the surface.
  const suspensionShadowStyle = useAnimatedStyle(() => {
    const lift = Math.max(scanActive.value, reveal.value);
    return {
      shadowColor: Palette.ink,
      shadowOpacity: interpolate(lift, [0, 1], [0.13, 0.1]),
      // shadowRadius static; the growing float distance reads through the offset.
      shadowRadius: 28,
      shadowOffset: { width: 0, height: interpolate(lift, [0, 1], [14, 30]) },
    };
  });

  // Connected-only surface sweep — the band's position/rotation envelope. Peak
  // brightness lives in the static SHIMMER_STRIPS; this only fades the whole band
  // in and out as it travels diagonally across the clipped card surface.
  const shimmerStyle = useAnimatedStyle(() => {
    const x = interpolate(connectedShimmer.value, [-0.4, 1.4], [-CARD_W, CARD_W]);
    return {
      transform: [{ translateX: x }, { rotate: '-20deg' }],
      opacity: interpolate(connectedShimmer.value, [-0.4, 0.05, 1.0, 1.4], [0, 1, 1, 0]),
    };
  });

  return (
    <Animated.View style={styles.outer} pointerEvents="none">
      <Animated.View style={cardWrap}>
        {/* Coloured energy glow — widest, sits behind the physical grounding. */}
        <Animated.View style={[styles.halo, haloStyle]} />

        {/*
         * Layered neutral depth. React Native allows only ONE shadow per View,
         * so the card's grounding is built from transparent sibling rectangles
         * behind it: a broad suspension shadow (the float) and a tight contact
         * shadow (near-contact). Both move and scale with the card via cardWrap.
         */}
        <Animated.View style={[styles.suspensionShadow, suspensionShadowStyle]} pointerEvents="none" />
        <Animated.View style={[styles.contactShadow, contactShadowStyle]} pointerEvents="none" />

        {/* NFC field rings — belong to the card, driven by the shared field pulse */}
        <NfcField
          fieldPulse={fieldPulse}
          scanActive={scanActive}
          reading={reading}
          settled={settled}
          cardWidth={CARD_W}
          cardHeight={CARD_H}
          glowColor={cv.traceGlow}
          reduced={reduced}
        />

        {/*
         * THE card — one continuous object across every state. Its physical
         * grounding now lives on the sibling shadow Views above; the body keeps
         * only its fill + clip (elevation remains so Android still has depth).
         */}
        <Animated.View style={[styles.card, bodyStyle]}>
          {/* ── Light-facing top edge highlight (acrylic dimensional cue) ── */}
          <View style={[styles.edgeLight, { backgroundColor: cv.edgeLight }]} />
          {/* Opposite-edge soft shadow */}
          <View style={[styles.edgeDark, { backgroundColor: cv.edgeDark }]} />

          {/* ── Energy-pass glow behind the debossed trace bundle ── */}
          <Animated.View style={[styles.traceGlowHost, energyPass]} pointerEvents="none" />

          {/* ── Five nested antenna traces, debossed (light / wire / shadow) ── */}
          <Animated.View style={[styles.traceHost, traceDefStyle]} pointerEvents="none">
            {traceLayers.map((l, i) => (
              <View
                key={`trace-${i}`}
                style={[
                  styles.trace,
                  {
                    top: l.top,
                    left: l.left,
                    width: l.w,
                    height: l.h,
                    borderRadius: l.radius,
                    borderWidth: TRACE_THICKNESS,
                    borderColor: l.color,
                    opacity: l.opacity,
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/*
           * Front-acrylic film over the antenna bundle — the embedding effect.
           * A faint body-tinted layer sits ABOVE the wires so the coloured acrylic
           * reads as being BETWEEN the viewer and the antenna: the wires look cast
           * INSIDE the slab, not printed on its surface. Rendered below the printed
           * content + cream panel (which are ON the surface) and above the milky
           * scatter veil.
           */}
          <View
            style={[styles.traceDepthVeil, { backgroundColor: cv.body }]}
            pointerEvents="none"
          />

          {/* ── Milky internal veil — light scattering inside the acrylic ── */}
          <View style={styles.veil} pointerEvents="none" />

          {/*
           * Connected-only surface sweep — a soft diagonal band of refracted
           * light. Sits ABOVE the acrylic body (fill + traces + veil) but BELOW
           * the printed content and cream insert, so it influences only the
           * surface. The card's overflow:hidden clips the band to the silhouette.
           */}
          {!reduced && isConnected && (
            <View style={styles.shimmerClip} pointerEvents="none">
              <Animated.View style={[styles.shimmerBand, shimmerStyle]}>
                {SHIMMER_STRIPS.map((s, i) => (
                  <View
                    key={`sh-${i}`}
                    style={[
                      styles.shimmerStrip,
                      {
                        width: s.w,
                        opacity: s.o,
                        // Slide each strip under the next so they overlap and
                        // composite smoothly (last strip has no successor).
                        marginRight: i < SHIMMER_STRIPS.length - 1 ? -s.w * SHIMMER_OVERLAP : 0,
                      },
                    ]}
                  />
                ))}
              </Animated.View>
            </View>
          )}

          {/* ── Printed body content (above traces, below panel) ── */}
          <View style={styles.bodyContent} pointerEvents="none">
            <Text style={styles.wordmark}>Burner</Text>
            <Text style={styles.serial}>BRNR••••••••</Text>
            <View style={styles.spacer} />
            <Text style={styles.phrase}>Ethereum in</Text>
            <Text style={styles.phrase}>your pocket.</Text>
          </View>

          {/* ── Opaque lower panel (covers the lower trace runs) ── */}
          <View style={styles.panel}>
            {/* contactless mark — morphs wifi→loading→check→wifi through the flow */}
            <StatusMark phase={phase} reduced={reduced} />
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    // cardWrap shrink-wraps the card and has no centering, so an absolute child
    // with no insets anchors at the card's top-left. The negative insets re-center
    // this larger View on the card so the glow is concentric.
    top: -HALO_BLEED,
    left: -HALO_BLEED,
    width: CARD_W + HALO_BLEED * 2,
    height: CARD_H + HALO_BLEED * 2,
    borderRadius: 40,
    backgroundColor: 'transparent',
  },
  // Broad suspension shadow — a card-shaped transparent rectangle casting the
  // float shadow. Sibling of the card (RN: one shadow per View). The animated
  // style tunes opacity/radius/offset as the card lifts.
  suspensionShadow: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  // Tight contact shadow — near-contact with the surface. Same pattern.
  contactShadow: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    // Physical grounding lives on the sibling suspension/contact shadow Views.
    // elevation is Android-only (iOS ignores it), so it gives Android depth
    // without adding an iOS shadow here.
    elevation: 5,
  },
  // Light-facing (top) edge highlight — sells the acrylic material.
  edgeLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    opacity: 0.8,
  },
  // Opposite-edge soft shadow.
  edgeDark: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    opacity: 0.35,
  },
  // Host for the trace energy-pass glow. Sits behind the trace borders. Shaped
  // to the OUTERMOST trace (not absoluteFill) so the shadow radiates INTO the
  // card around the bundle — an even halo on every side, including the top. A
  // full-card host casts its blur OUTSIDE the card, where the body's
  // overflow:hidden + borderRadius clip it to nothing (or to an uneven,
  // corner-clipped smear), which read as the blur being applied inconsistently.
  traceGlowHost: {
    position: 'absolute',
    top: TRACE_INSET_START,
    left: TRACE_INSET_START,
    width: CARD_W - TRACE_INSET_START * 2,
    height: CARD_H - TRACE_INSET_START * 2,
    borderRadius: TRACE_RADIUS_BASE,
  },
  // Host for the debossed trace bundle. absoluteFill so the per-layer absolute
  // positions resolve in the card's coordinate space; carries the animated
  // definition opacity for the whole bundle.
  traceHost: {
    ...StyleSheet.absoluteFill,
  },
  trace: {
    position: 'absolute',
    // borderColor + borderWidth + opacity set inline per deboss layer.
  },
  // Milky internal veil — a faint warm scatter over the body fill + traces,
  // below the printed content. Suggests light diffusing through the acrylic.
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: VEIL_COLOR,
  },
  // Front-acrylic film over the antenna bundle (the embedding effect). Colour is
  // set inline per variant (cv.body); this opacity controls how strongly the
  // wires read as sitting BEHIND a film of coloured acrylic. Distinct from the
  // milky veil above: that one scatters light; this one fronts the wires.
  traceDepthVeil: {
    ...StyleSheet.absoluteFill,
    opacity: 0.25,
  },
  // Printed body content — wordmark, serial, phrase. Above traces, below panel.
  // Horizontal padding clears the inner antenna trace (innermost inset ≈ 20px).
  bodyContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: PANEL_HEIGHT + PANEL_BOTTOM_MARGIN, // stop above the panel
    paddingHorizontal: 30, // shifted right of the original 26; clears the inner trace (~20px inset)
    paddingTop: 30,
    paddingBottom: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  wordmark: {
    color: '#FFFFFF',
    fontFamily: Palette.serif,
    fontSize: 30,
    fontWeight: '400',
    lineHeight: 32,
  },
  serial: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: Palette.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    marginTop: 6,
  },
  spacer: {
    flex: 1,
  },
  phrase: {
    color: '#FFFFFF',
    fontFamily: Palette.serif,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 18,
    textAlign: 'left',
  },
  // Opaque lower panel — light cream insert. Content aligned LEFT so the NFC
  // mark sits on the left side of the panel.
  panel: {
    position: 'absolute',
    left: PANEL_INSET_X,
    right: PANEL_INSET_X,
    bottom: PANEL_BOTTOM_MARGIN,
    height: PANEL_HEIGHT,
    backgroundColor: PANEL.fill,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PANEL.edge,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 14,
  },
  // Clip host for the connected sweep. Absolute + overflow:hidden so it is the
  // band's containing block AND clips it to the card bounds (the band's own
  // containing block would otherwise be the transformed cardWrap, an ancestor of
  // the card, which the card's overflow:hidden does not reliably clip in RN).
  // The card's rounded overflow:hidden then clips this host to the silhouette.
  shimmerClip: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  // Connected surface sweep — a soft diagonal band of overlapping translucent
  // strips (no gradient dependency). Tall enough to cover the card when rotated;
  // the clip host contains it. The animated style translates + rotates.
  shimmerBand: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    width: SHIMMER_BAND_WIDTH,
    flexDirection: 'row',
  },
  // A single vertical slice of the band. Height comes from the default
  // alignItems:'stretch' on the row (the band has a definite height from its
  // top/bottom insets); opacity set inline per SHIMMER_STRIPS.
  shimmerStrip: {
    backgroundColor: 'rgba(255, 250, 240, 1)',
  },
});
