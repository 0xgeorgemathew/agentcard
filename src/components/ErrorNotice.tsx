/**
 * ErrorNotice — a compact BurnerOS error module for recoverable failures.
 *
 * Handles `timedOut`, `unsupportedCard`, and `connectionFailed`. The caller
 * decides when to mount/unmount; this component only animates its own entrance.
 *
 * Rendered as an outlined danger-tinted BurnerModule with a pixel alert glyph,
 * a state-specific message, and one acid-lime "Try again" action. Status is
 * never communicated by colour alone — the glyph + label always pair with text.
 *
 * State-specific copy lives here so the messaging stays consistent with the spec.
 */
import { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Palette, Radius, Spacing, Motion, hardShadow } from '@/constants/theme';
import { BurnerModule } from '@/components/BurnerModule';

export type ErrorKind = 'timedOut' | 'unsupportedCard' | 'connectionFailed';

type Props = {
  kind: ErrorKind;
  visible: boolean;
  onRetry: () => void;
};

const COPY: Record<ErrorKind, { title: string; body: string }> = {
  timedOut: {
    title: 'Card not detected',
    body: 'Bring the Burner card near the top of your iPhone and try again.',
  },
  unsupportedCard: {
    title: 'Unsupported NFC card',
    body: 'This card could not be identified as a compatible Arx Burner.',
  },
  connectionFailed: {
    title: 'Couldn’t read the card',
    body: 'Keep the card in place until the read completes.',
  },
};

export function ErrorNotice({ kind, visible, onRetry }: Props) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const ty = useSharedValue(16);

  useEffect(() => {
    if (visible) {
      // Reset, then rise + fade so re-shows replay the entrance.
      opacity.value = 0;
      ty.value = 16;
      opacity.value = withTiming(1, { duration: Motion.base, easing: Easing.out(Easing.cubic) });
      ty.value = withTiming(0, { duration: Motion.slow, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = withTiming(0, { duration: Motion.fast });
    }
  }, [visible, opacity, ty]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  // Reduced motion: skip the rise, keep a gentle fade.
  const styleReduced = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const { title, body } = COPY[kind];

  return (
    <Animated.View
      style={[styles.host, reduced ? styleReduced : style]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${body}`}
    >
      <BurnerModule title="ERROR" tone="danger" radius="m" style={styles.panel}>
        <View style={styles.row}>
          <AlertGlyph />
          <View style={styles.text}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
        </View>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try connecting your Burner again"
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </BurnerModule>
    </Animated.View>
  );
}

/** A small, restrained alert mark — not a loud warning illustration. */
function AlertGlyph() {
  return (
    <View style={styles.glyphWrap}>
      <View style={styles.glyphBody}>
        <View style={styles.glyphBar} />
        <View style={styles.glyphDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    bottom: 40,
    left: Spacing.four,
    right: Spacing.four,
  },
  panel: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  glyphWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  // Recoloured for BurnerOS: dangerText outline on a soft danger fill.
  glyphBody: {
    width: 16,
    height: 17,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Palette.dangerText,
    backgroundColor: Palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
    gap: 2,
  },
  glyphBar: {
    width: 2,
    height: 5,
    backgroundColor: Palette.dangerText,
    borderRadius: 1,
  },
  glyphDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: Palette.dangerText,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: Palette.dangerText,
    fontFamily: Palette.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  body: {
    color: Palette.ink,
    fontFamily: Palette.sans,
    fontSize: 13.5,
    lineHeight: 19,
  },
  // The single Acid-lime interaction: filled acid block, near-black ink label,
  // crisp outline + the signature hard offset shadow.
  retry: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.s,
    backgroundColor: Palette.acid,
    borderWidth: 1,
    borderColor: Palette.border,
    minHeight: 40,
    justifyContent: 'center',
    ...hardShadow('sm'),
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryText: {
    color: Palette.acidBtnInk,
    fontFamily: Palette.mono,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
