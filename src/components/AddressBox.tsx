/**
 * AddressBox — the connected-state wallet readout.
 *
 * A glass slab (GlassSurface) showing the card's full EIP-55 Ethereum address
 * with a copy button. Shown below the card once a Burner connects.
 *
 * Full-address guarantee: the address Text is `numberOfLines={1}` with
 * `adjustsFontSizeToFit` + `minimumFontScale`, so the WHOLE 0x… string always
 * renders on every screen width — the font shrinks rather than truncating.
 * "Keep it small enough to show the full address" = a compact slab that never
 * ellipsizes the address.
 *
 * Copy: expo-clipboard writes the address, a Light haptic confirms, and the
 * glyph swaps copy → check for ~1.4s as feedback (status is never by colour
 * alone — the icon shape changes too).
 */
import { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Palette, Radius } from '@/constants/theme';
import { GlassSurface } from '@/components/GlassSurface';

type Props = {
  /** EIP-55 checksummed address (0x + 40 hex). */
  address: string;
};

/** How long the copy → check confirmation glyph stays visible. */
const COPIED_FEEDBACK_MS = 1400;

export function AddressBox({ address }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    // Guard against rapid re-taps resetting the timer before the icon flips.
    if (copied) return;
    await Clipboard.setStringAsync(address);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  return (
    <GlassSurface
      width="100%"
      height={60}
      radius={Radius.l}
      contentContainerStyle={{
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text
        style={styles.address}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {address}
      </Text>

      <Pressable
        onPress={onCopy}
        accessibilityRole="button"
        accessibilityLabel={copied ? 'Address copied' : 'Copy address'}
        style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
      >
        {copied ? (
          <CheckGlyph color={Palette.good} />
        ) : (
          <CopyGlyph color={Palette.ink} />
        )}
      </Pressable>
    </GlassSurface>
  );
}

/**
 * Copy glyph — two overlapping rounded-rect "documents" (a back outline + a
 * front page), the universal copy mark. Drawn from Views, no assets.
 */
function CopyGlyph({ color }: { color: string }) {
  return (
    <View style={styles.copyGlyph}>
      {/* Back document — outline only, sits behind. */}
      <View style={[styles.copyDoc, styles.copyDocBack, { borderColor: color }]} />
      {/* Front document — frosted fill so it occludes the back's lines and reads
          as the page on top. */}
      <View
        style={[
          styles.copyDoc,
          styles.copyDocFront,
          { borderColor: color, backgroundColor: 'rgba(255, 253, 247, 0.92)' },
        ]}
      />
    </View>
  );
}

/**
 * Check glyph — two rotated bars forming a ✓. Geometry mirrors the (removed)
 * connected-state verification check, proven to read as a clean checkmark.
 */
function CheckGlyph({ color }: { color: string }) {
  return (
    <View style={styles.checkGlyph}>
      <View style={[styles.checkShort, { backgroundColor: color }]} />
      <View style={[styles.checkLong, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  address: {
    flex: 1,
    color: Palette.ink,
    fontFamily: Palette.mono,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.s,
    borderWidth: 1,
    borderColor: 'rgba(28, 25, 25, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnPressed: {
    opacity: 0.6,
  },
  // Copy glyph host — 16px square, the two overlapping docs centred in it.
  copyGlyph: {
    width: 16,
    height: 16,
  },
  copyDoc: {
    position: 'absolute',
    width: 9,
    height: 11,
    borderRadius: 2,
    borderWidth: 1,
  },
  copyDocBack: {
    top: 0,
    right: 0,
  },
  copyDocFront: {
    bottom: 0,
    left: 0,
  },
  // Check glyph host — 24px square (the button is 36px, so it centres with room).
  checkGlyph: {
    width: 24,
    height: 24,
  },
  checkShort: {
    position: 'absolute',
    width: 8,
    height: 3,
    borderRadius: 2,
    left: 3,
    top: 14,
    transform: [{ rotate: '45deg' }],
  },
  checkLong: {
    position: 'absolute',
    width: 16,
    height: 3,
    borderRadius: 2,
    right: 0,
    top: 11,
    transform: [{ rotate: '-55deg' }],
  },
});
