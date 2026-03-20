/**
 * BurnerModule — the BurnerOS outlined-panel primitive.
 *
 * A framed information module: thin near-black outline, warm-paper fill,
 * minimally rounded corners, and the signature hard offset shadow. Used for
 * grouped information: error state, status, actions.
 *
 * Optional header row: a small pixel icon + an uppercase monospaced title +
 * one or more horizontal rules that fill the remaining header width (the
 * BurnerOS "terminal panel" look).
 */
import { ReactNode } from 'react';
import { StyleSheet, View, Text, type ViewProps } from 'react-native';
import { Palette, Radius, Spacing, hardShadow } from '@/constants/theme';

type BurnerModuleProps = ViewProps & {
  /** Optional module title shown in the header row. */
  title?: string;
  /** Optional small icon node rendered before the title (pixel glyph). */
  icon?: ReactNode;
  /** Show the horizontal rule that fills the header's remaining width. */
  headerRule?: boolean;
  /** Corner radius key. Defaults to 'm' (the BurnerOS slightly-rounded square). */
  radius?: keyof typeof Radius;
  /** Tint shifts the hard shadow + outline for semantic emphasis. */
  tone?: 'default' | 'success' | 'danger';
  children?: ReactNode;
};

export function BurnerModule({
  title,
  icon,
  headerRule = true,
  radius = 'm',
  tone = 'default',
  style,
  children,
  ...rest
}: BurnerModuleProps) {
  const r = Radius[radius];
  const hasHeader = Boolean(title || icon);

  const outline =
    tone === 'success'
      ? Palette.goodStroke
      : tone === 'danger'
        ? Palette.dangerStroke
        : Palette.border;

  return (
    <View
      style={[
        styles.base,
        { borderRadius: r, borderColor: outline, backgroundColor: Palette.surface },
        hardShadow(tone === 'default' ? 'md' : 'lg'),
        style,
      ]}
      {...rest}
    >
      {hasHeader && (
        <View style={styles.header}>
          {icon && <View style={styles.icon}>{icon}</View>}
          {title && <Text style={styles.title}>{title}</Text>}
          {headerRule && <View style={[styles.rule, { backgroundColor: Palette.rule }]} />}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  icon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Palette.ink,
    fontFamily: Palette.mono,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  rule: {
    flex: 1,
    height: 1,
  },
});
