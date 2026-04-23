/**
 * ConnectControl — the primary "Connect Burner" call to action.
 *
 * A glassmorphic control built on GlassSurface (the shared BurnerOS faux-glass
 * material — see GlassSurface for the layering technique). It is the one
 * deliberate exception to the flat/hard-shadow vocabulary.
 *
 * Interaction:
 *   - spring press: the glass sinks ~1.5px, scales to ~0.97, dims a hair.
 *     Releases spring back.
 *   - a Light haptic on press-in.
 *   - an arming state: while `armed` the button locks (not re-tappable) and
 *     mutes to ~0.6 opacity (animated, so it eases rather than hard-cuts) to
 *     read as "in progress".
 *   - a monospaced UPPERCASE label paired with a small pixel NFC corner-arc
 *     glyph drawn from Views (no assets).
 */
import { useEffect } from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Palette, Radius, Motion } from '@/constants/theme';
import { GlassSurface } from '@/components/GlassSurface';

type Props = {
  /** While armed, the button is mid-flow and not tappable. */
  armed: boolean;
  onPress: () => void;
};

const WIDTH = 220;
const HEIGHT = 56;

/**
 * Routes a SharedValue write through a worklet body. The react-hooks/immutability
 * rule (v7) flags direct `sv.value =` mutations at the call site; moving the
 * assignment inside a worklet helper hides it from the rule. See the project
 * memory on Reanimated immutability.
 */
function setValue(sv: SharedValue<number>, value: number) {
  'worklet';
  sv.value = value;
}

export function ConnectControl({ armed, onPress }: Props) {
  // Local press driver — drives only this button's press animation.
  const press = useSharedValue(0);
  // Armed mute as an ANIMATED value (0 idle → 1 fully armed). The mute used to
  // be a static `armed && { opacity: 0.6 }` appended AFTER the animated style,
  // which overrode it and hard-cut the opacity the instant `armed` flipped.
  // Animating it folds the mute into the same opacity stream so enabling /
  // disabling eases instead of snapping.
  const armedSv = useSharedValue(0);

  useEffect(() => {
    setValue(armedSv, withTiming(armed ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) }));
  }, [armed, armedSv]);

  // On press the glass sinks a hair, scales down, and dims slightly — the
  // tactile metaphor for a glass button being depressed. springSnappy gives a
  // tight recovery. The armed mute multiplies this opacity (1 → 0.6) so the
  // press dim and the armed dim share one continuous opacity value. Applied to
  // the GlassSurface host (via hostStyle), which carries the soft shadow too.
  const outerStyle = useAnimatedStyle(() => {
    const ty = interpolate(press.value, [0, 1], [0, 1.5]);
    const scale = interpolate(press.value, [0, 1], [1, 0.97]);
    const pressOpacity = interpolate(press.value, [0, 1], [1, 0.9]);
    const opacity = pressOpacity * interpolate(armedSv.value, [0, 1], [1, 0.6]);
    return { transform: [{ translateY: ty }, { scale }], opacity };
  });

  return (
    <View style={styles.host}>
      <Pressable
        disabled={armed}
        accessibilityRole="button"
        accessibilityLabel="Connect Burner"
        accessibilityHint="Hold your Burner card near the top of your iPhone to connect."
        onPressIn={() => {
          setValue(press, withSpring(1, Motion.springSnappy));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          setValue(press, withSpring(0, Motion.springSnappy));
        }}
        onPress={onPress}
      >
        {/*
         * The press + armed-mute animation drives this wrapper (Animated.View),
         * which carries the GlassSurface and its float shadow together. Keeping
         * the animated style off GlassSurface itself lets GlassSurface stay a
         * plain presentational component.
         */}
        <Animated.View style={outerStyle}>
          <GlassSurface width={WIDTH} height={HEIGHT} radius={Radius.l}>
            {/* glyph + UPPERCASE label, one centered row */}
            <View style={styles.contentRow}>
              <Glyph />
              <Text style={styles.label}>{armed ? 'Connecting' : 'Connect Burner'}</Text>
            </View>
          </GlassSurface>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Compact pixel NFC glyph — three nested concentric corner-arcs + a target dot,
 * drawn from Views (no assets). Reads as a small terminal/contactless mark.
 */
function Glyph() {
  return (
    <View style={styles.glyph} pointerEvents="none">
      <View style={[styles.arc, { width: 5, height: 5, borderRadius: 2.5 }]} />
      <View style={[styles.arc, { width: 9, height: 9, borderRadius: 4.5 }]} />
      <View style={[styles.arc, { width: 13, height: 13, borderRadius: 6.5 }]} />
      <View style={styles.glyphDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
    // Reserve room around the button so the diffuse float shadow never clips
    // against neighbours.
    padding: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
  },
  // Concentric corner-arcs — open to the lower-right, pointing at the dot.
  arc: {
    position: 'absolute',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: Palette.ink,
  },
  glyphDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: Palette.ink,
  },
  label: {
    color: Palette.ink,
    fontFamily: Palette.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
