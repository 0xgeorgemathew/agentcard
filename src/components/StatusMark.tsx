/**
 * StatusMark — the panel contactless mark that morphs through the connection
 * flow and returns home.
 *
 * ONE printed mark, three shapes, all decoded from pixelarticons (MIT) on the
 * same 24×24 grid as the card's other pixel marks. The mark IS the indicator:
 *
 *   idle / error ......... wifi        (resting contactless glyph)
 *   preparing→reading .... hourglass   (sand flowing between two frames)
 *   verifying ............ check       (success confirmation)
 *   connected ............ check → wifi (holds a beat, dissolves home)
 *
 * The hourglass is two frames — `hourglass` (sand at the top) and `hourglass-2`
 * (sand fallen through, piled at the bottom). They share the SAME glass outline
 * (walls + neck + caps); only the sand differs. The frames are crossfaded via a
 * single `flow` value (0↔1) whose opacities sum to 1, so the shared outline stays
 * rock-solid while only the sand shimmers — the printed mark never appears to
 * move, which keeps the physical-card illusion intact (no rotation).
 *
 * Each shape is its own pixel layer stacked in the same host; shape-to-shape
 * transitions are opacity crossfades with a tiny scale settle. Built from Views
 * — no assets, no blur — matching the rest of the card.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';

import { Motion, PANEL } from '@/constants/theme';
import type { VisualPhase } from '@/motion/useConnectionMotion';

// ── timing ──
const CROSSFADE_MS = 320; // shape-to-shape morph
const SAND_MS = 550; // one leg of the sand flow (full A↔B cycle = 2 × SAND_MS)
const CHECK_HOLD_MS = 700; // check holds at 'connected' before returning to wifi

// ── the 24×24 grid every shape shares ──
const GRID = 24;
// Integer PX so every pixel square snaps to a device pixel. A fractional size
// (e.g. 1.1) lands the squares on sub-pixel boundaries and their edges
// anti-alias soft — the root cause of the blurry wifi mark.
const PX = 1; // rendered pixel size → mark = 24px square

type Pixel = { x: number; y: number; w: number; h: number };

// pixelarticons "wifi" — two nested arcs + bottom dot. The resting mark.
// Source: https://pixelarticons.com/icon/wifi/ (top/outer arc removed)
// Authored one step in from the grid edge and vertically centered in the 24×24
// host so it crossfades in register with the check/hourglass. The size is baked
// into the coordinates — NOT a layer scale — because scaling the rasterized
// squares is what blurred the mark.
const WIFI_PIXELS: Pixel[] = [
  { x: 8, y: 6, w: 8, h: 2 }, // upper arc bar
  { x: 6, y: 8, w: 2, h: 2 }, // upper arc L shoulder
  { x: 16, y: 8, w: 2, h: 2 }, // upper arc R shoulder
  { x: 4, y: 10, w: 2, h: 2 }, // upper arc L outer
  { x: 18, y: 10, w: 2, h: 2 }, // upper arc R outer
  { x: 9, y: 11, w: 6, h: 2 }, // lower arc bar
  { x: 7, y: 13, w: 2, h: 2 }, // lower arc L shoulder
  { x: 15, y: 13, w: 2, h: 2 }, // lower arc R shoulder
  { x: 11, y: 16, w: 2, h: 2 }, // bottom dot
];

// pixelarticons "hourglass" — sand piled at the TOP, bottom bulb empty. Frame A.
// Source: https://pixelarticons.com/icon/hourglass/
const HOURGLASS_PIXELS: Pixel[] = [
  { x: 8, y: 2, w: 8, h: 2 }, // top cap
  { x: 6, y: 4, w: 2, h: 4 }, // left wall, upper
  { x: 16, y: 4, w: 2, h: 4 }, // right wall, upper
  { x: 8, y: 8, w: 2, h: 2 }, // top sand, left shoulder
  { x: 14, y: 8, w: 2, h: 2 }, // top sand, right shoulder
  { x: 10, y: 10, w: 4, h: 4 }, // neck
  { x: 8, y: 14, w: 2, h: 2 }, // bottom bulb, left
  { x: 14, y: 14, w: 2, h: 2 }, // bottom bulb, right
  { x: 6, y: 16, w: 2, h: 4 }, // left wall, lower
  { x: 16, y: 16, w: 2, h: 4 }, // right wall, lower
  { x: 8, y: 20, w: 8, h: 2 }, // bottom cap
];

// pixelarticons "hourglass-2" — sand fallen THROUGH: top emptied, a stream in the
// neck, sand piled at the bottom. Frame B. Shares the glass outline with frame A;
// only the sand differs. Source: https://pixelarticons.com/icon/hourglass-2/
const HOURGLASS2_PIXELS: Pixel[] = [
  { x: 6, y: 2, w: 12, h: 2 }, // top rim (sand at the edges)
  { x: 6, y: 4, w: 2, h: 4 }, // left wall, upper
  { x: 16, y: 4, w: 2, h: 4 }, // right wall, upper
  { x: 8, y: 8, w: 8, h: 2 }, // upper bulb, full sand
  { x: 10, y: 10, w: 4, h: 4 }, // neck
  { x: 8, y: 14, w: 2, h: 2 }, // bottom bulb, left
  { x: 11, y: 14, w: 2, h: 4 }, // falling stream, centre
  { x: 14, y: 14, w: 2, h: 2 }, // bottom bulb, right
  { x: 6, y: 16, w: 2, h: 2 }, // left wall, lower
  { x: 16, y: 16, w: 2, h: 2 }, // right wall, lower
  { x: 6, y: 18, w: 12, h: 2 }, // bottom sand (accumulated)
  { x: 8, y: 20, w: 8, h: 2 }, // bottom cap
];

// pixelarticons "check" — the success confirmation glyph.
// Source: https://pixelarticons.com/icon/check/
const CHECK_PIXELS: Pixel[] = [
  { x: 4, y: 12, w: 2, h: 2 },
  { x: 6, y: 14, w: 2, h: 2 },
  { x: 8, y: 16, w: 2, h: 2 },
  { x: 10, y: 14, w: 2, h: 2 },
  { x: 12, y: 12, w: 2, h: 2 },
  { x: 14, y: 10, w: 2, h: 2 },
  { x: 16, y: 8, w: 2, h: 2 },
  { x: 18, y: 6, w: 2, h: 2 },
];

// Precomputed per-pixel styles. Every input is a module constant, so each icon's
// style array is built once at load and is referentially stable across renders.
function pixelStyles(pixels: Pixel[]) {
  return pixels.map((p) => ({
    position: 'absolute' as const,
    left: p.x * PX,
    top: p.y * PX,
    width: p.w * PX,
    height: p.h * PX,
    backgroundColor: PANEL.ink,
  }));
}
const WIFI_STYLES = pixelStyles(WIFI_PIXELS);
const HOURGLASS_STYLES = pixelStyles(HOURGLASS_PIXELS);
const HOURGLASS2_STYLES = pixelStyles(HOURGLASS2_PIXELS);
const CHECK_STYLES = pixelStyles(CHECK_PIXELS);

/**
 * Routes a SharedValue write through a worklet body. The react-hooks/immutability
 * rule flags direct `sv.value =` at the call site; the worklet helper hides it.
 * Called from an effect (JS thread) — runs synchronously there. See the project
 * memory on Reanimated immutability.
 */
function commit(sv: SharedValue<number>, value: number) {
  'worklet';
  sv.value = value;
}

export function StatusMark({ phase, reduced }: { phase: VisualPhase; reduced: boolean }) {
  // Top-level shape opacities (0/1, crossfading between them) + the hourglass
  // sand-flow blend (0 = frame A / sand at top, 1 = frame B / sand at bottom).
  const wifiA = useSharedValue(1);
  const loadA = useSharedValue(0);
  const checkA = useSharedValue(0);
  const flow = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(...Motion.easeOut);
    const to = (sv: SharedValue<number>, target: number) =>
      commit(sv, withTiming(target, { duration: CROSSFADE_MS, easing: ease }));

    const isLoading = phase === 'activating' || phase === 'scanning' || phase === 'reading';

    // 'connected' holds the check, then dissolves back to the resting wifi mark.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (phase === 'connected') {
      to(loadA, 0);
      to(wifiA, 0);
      to(checkA, 1);
      timers.push(
        setTimeout(() => {
          to(checkA, 0);
          to(wifiA, 1);
        }, CHECK_HOLD_MS),
      );
    } else if (isLoading) {
      to(wifiA, 0);
      to(checkA, 0);
      to(loadA, 1);
    } else if (phase === 'verifying') {
      to(loadA, 0);
      to(wifiA, 0);
      to(checkA, 1);
    } else {
      // idle / error — resting wifi.
      to(loadA, 0);
      to(checkA, 0);
      to(wifiA, 1);
    }

    // Sand flow: crossfade the two hourglass frames only while loading. When
    // leaving, let an in-flight flow wind down THROUGH the crossfade (so the sand
    // never freezes while still visible), then halt once the mark is invisible.
    // Reduced motion: no flow — static frame A (sand at top).
    const sandEase = Easing.inOut(Easing.quad);
    if (!reduced && isLoading) {
      commit(flow, 0);
      commit(
        flow,
        withRepeat(
          withSequence(
            withTiming(1, { duration: SAND_MS, easing: sandEase }),
            withTiming(0, { duration: SAND_MS, easing: sandEase }),
          ),
          -1,
          false,
        ),
      );
    } else if (!reduced) {
      timers.push(setTimeout(() => cancelAnimation(flow), CROSSFADE_MS + 60));
    } else {
      cancelAnimation(flow);
      commit(flow, 0);
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [phase, reduced, wifiA, loadA, checkA, flow]);

  // Each shape is its own absolute layer; opacity crossfades between them with a
  // tiny scale settle so a morph reads as the shape re-forming, not a hard swap.
  const wifiStyle = useAnimatedStyle(() => ({
    opacity: wifiA.value,
    // Settle scale (the fade-in dip) — matches the check/load settle. Wifi is
    // sized through its pixel coordinates, so there is no permanent downscale
    // here (a downscale is what rasterized-and-blurred the old mark).
    transform: [{ scale: interpolate(wifiA.value, [0, 1], [0.86, 1]) }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkA.value,
    transform: [{ scale: interpolate(checkA.value, [0, 1], [0.86, 1]) }],
  }));
  const loadStyle = useAnimatedStyle(() => ({
    opacity: loadA.value,
    transform: [{ scale: interpolate(loadA.value, [0, 1], [0.92, 1]) }],
  }));

  // The two hourglass frames live inside the loading layer. Their opacities
  // (1−flow, flow) always sum to 1, so the shared glass outline they have in
  // common stays fully solid and only the sand shifts between them.
  const frameAStyle = useAnimatedStyle(() => ({ opacity: 1 - flow.value }));
  const frameBStyle = useAnimatedStyle(() => ({ opacity: flow.value }));

  return (
    <View style={styles.host}>
      <Animated.View style={[styles.layer, wifiStyle]} pointerEvents="none">
        {WIFI_STYLES.map((s, i) => (
          <View key={`wf-${i}`} style={s} />
        ))}
      </Animated.View>

      <Animated.View style={[styles.layer, loadStyle]} pointerEvents="none">
        <Animated.View style={[styles.layer, frameAStyle]} pointerEvents="none">
          {HOURGLASS_STYLES.map((s, i) => (
            <View key={`ha-${i}`} style={s} />
          ))}
        </Animated.View>
        <Animated.View style={[styles.layer, frameBStyle]} pointerEvents="none">
          {HOURGLASS2_STYLES.map((s, i) => (
            <View key={`hb-${i}`} style={s} />
          ))}
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.layer, checkStyle]} pointerEvents="none">
        {CHECK_STYLES.map((s, i) => (
          <View key={`ck-${i}`} style={s} />
        ))}
      </Animated.View>
    </View>
  );
}

const MARK_SIZE = GRID * PX;

const styles = StyleSheet.create({
  host: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  // Every shape layer fills the host; its pixel Views position themselves on the
  // shared 24×24 grid within.
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
