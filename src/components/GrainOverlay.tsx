/**
 * GrainOverlay — a static film-grain texture over the warm cream canvas.
 *
 * Gives the paper-cream surface a subtle physical tooth: a fine, warm,
 * seamless noise at very low opacity, rendered fullscreen ABOVE the ambient
 * colour fields but BELOW the card and interactive UI. It is STATIC (never
 * animated) — perceptible only through the movement of the ambient light, never
 * at a casual glance, and never strong enough to dirty the card or reduce text
 * contrast (the card + UI render above it, so it textures only the exposed
 * background).
 *
 * The texture is generated dependency-free by scripts/make-grain.mjs (a hand
 * PNG encoder) → assets/grain.png. The PNG carries full-range alpha noise; the
 * final multiplier below sets the effective opacity so it can be tuned without
 * regenerating the asset.
 */
import { Image, StyleSheet, View } from 'react-native';

// Average effective opacity ≈ 0.5 (mean PNG alpha) × this multiplier ≈ 0.028,
// within the 0.02–0.04 band.
const GRAIN_OPACITY = 0.055;

// Relative require so the asset resolves without depending on Metro's tsconfig
// path aliasing for image assets.
const GRAIN = require('../../assets/grain.png');

export function GrainOverlay() {
  return (
    // The wrapping View carries pointerEvents (RN's Image prop type does not
    // expose it in this version) and clips touch from the texture.
    <View pointerEvents="none" style={styles.host}>
      {/*
       * Sizing note: an absolutely-positioned Image with only insets can fall
       * back to its intrinsic dimensions instead of the parent's, leaving the
       * texture pinned to the top-left. flex:1 + width:'100%' force the Image
       * to fill the fullscreen host so the grain covers the whole canvas.
       */}
      <Image source={GRAIN} resizeMode="stretch" style={styles.grain} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
  },
  grain: {
    flex: 1,
    width: '100%',
    opacity: GRAIN_OPACITY,
  },
});
