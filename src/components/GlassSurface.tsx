/**
 * GlassSurface — the reusable BurnerOS faux-glass material.
 *
 * Real backdrop blur / iOS 26 Liquid Glass (`expo-glass-effect`) is unavailable
 * at the iOS 16.4 deploy target, so glass is faked from layered low-alpha fills
 * + edge highlights — the same technique [[connect-button-glass]] uses for the
 * Connect button and BurnerCard uses for translucent acrylic. Centralising it
 * here keeps the glass vocabulary identical across every glass control (Connect
 * button, connected pill, address box).
 *
 * The glass read comes from four cues, none of them blur:
 *   - a translucent frosted body fill (the cream canvas + grain show through)
 *   - a bright specular highlight on the top edge (light catching the glass)
 *   - a faint inner shadow on the bottom edge (slab depth)
 *   - a soft, diffuse drop shadow (the float) — NOT a hard offset shadow; glass
 *     has no hard contact line.
 *
 * Structure mirrors the discipline in BurnerCard / ConnectControl: the soft
 * shadow lives on an OUTER host View, SEPARATE from the overflow:hidden inner
 * body. Co-locating a shadow with an overflow-hidden surface clips the shadow
 * on Android and gives iOS no shaped host to cast from.
 *
 * Sizing: pass `width` + `height` for a fixed surface (the Connect button, the
 * address box). Omit them to let the surface shrink-wrap its content (the
 * connected pill) — the content is in-flow and drives the host size, while the
 * glass body absoluteFills whichever size the host takes.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle, type DimensionValue } from 'react-native';
import { Palette } from '@/constants/theme';

// Frosted body — a warm-tinted translucent white so the cream canvas + grain
// bleed through. High enough alpha to read as a distinct slab, low enough to
// stay translucent glass.
const FROST = 'rgba(255, 253, 247, 0.55)';
// Glass rim — a thin light border; the classic glass edge catching light.
const RIM = 'rgba(255, 255, 255, 0.55)';
// Soft float shadow — diffuse, no hard offset. Glass has no crisp contact line.
const SOFT_SHADOW = {
  shadowColor: Palette.ink,
  shadowOpacity: 0.16,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
} as const;

type Props = {
  children: React.ReactNode;
  /** Corner radius. Use Radius.pill for pills, Radius.l for slabs. */
  radius: number;
  /** Fixed width. Omit to shrink-wrap the content. */
  width?: DimensionValue;
  /** Fixed height. Omit to shrink-wrap the content. */
  height?: DimensionValue;
  /** Layout for the content area. Defaults to centred. Override for rows etc. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Frosted fill colour override (e.g. a tinted glass). */
  frost?: string;
};

/**
 * Purely presentational — no animated props. Callers that need to animate the
 * surface (e.g. the Connect button's press + armed mute) wrap it in their own
 * Animated.View and drive that, so this component stays free of Reanimated.
 */
export function GlassSurface({
  children,
  radius,
  width,
  height,
  contentContainerStyle,
  frost,
}: Props) {
  // When both dimensions are fixed, the content can absoluteFill the host (so a
  // row can stretch edge-to-edge). When shrink-wrapping, the content stays
  // in-flow so it is what sizes the host; the glass body then fills that size.
  const sized = width != null && height != null;

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: 'transparent' },
        SOFT_SHADOW,
      ]}
    >
      {/*
       * The glass body — absoluteFills the host so it never participates in
       * sizing (letting the content drive a shrink-wrap). overflow:hidden clips
       * the specular + depth highlights to the rounded silhouette.
       */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            borderWidth: 1,
            borderColor: RIM,
            backgroundColor: frost ?? FROST,
            overflow: 'hidden',
          },
        ]}
        pointerEvents="none"
      >
        {/* Specular highlight on the light-facing (top) edge — sells the glass. */}
        <View
          style={[
            styles.specular,
            { borderTopLeftRadius: radius, borderTopRightRadius: radius },
          ]}
        />
        {/* Faint inner shadow on the bottom edge — slab depth. */}
        <View
          style={[
            styles.depth,
            { borderBottomLeftRadius: radius, borderBottomRightRadius: radius },
          ]}
        />
      </View>

      <View style={[sized ? StyleSheet.absoluteFill : null, styles.content, contentContainerStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  depth: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(28, 25, 25, 0.06)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
