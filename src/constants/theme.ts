/**
 * Design tokens for the Burner connection experience.
 *
 * The visual identity is BurnerOS: a warm, light, editorial canvas with a
 * terminal/monospaced UI vocabulary, crisp dark outlines, and a single
 * saturated Acid-lime accent. The physical card is a separate material world —
 * a portrait slab of translucent tinted acrylic with manufactured antenna
 * traces and a light cream insert panel.
 *
 * Everything is drawn with Views + Reanimated — no image assets, no blur, no
 * Liquid Glass. iOS 16.4 deploy target: expo-blur / expo-linear-gradient are
 * NOT required. Translucent acrylic is built from low-alpha fills + edge
 * highlights; modules use hard 1px outlines + a hard offset shadow.
 */

// ─────────────────────────────────────────────────────────────────────────────
// App surface palette — warm BurnerOS light
// ─────────────────────────────────────────────────────────────────────────────

export const Palette = {
  // ── base surfaces (warm, not clinical white) ───────────────────────────
  /** Primary page background — warm cream. */
  bg: '#F4F1EA',
  /** Pure paper surface for modules — warm white. */
  surface: '#FFFDF7',

  // ── ink ──────────────────────────────────────────────────────────────────
  /** Near-black warm ink for primary text + module outlines. */
  ink: '#1C1919',
  /** Muted labels, captions. */
  muted: '#77726C',

  // ── outlines + rules ─────────────────────────────────────────────────────
  /** Module border + hard outline. Same near-black as ink for crisp frames. */
  border: '#1C1919',
  /** Subtle divider rule inside modules. */
  rule: '#D9D3C7',

  // ── primary accent — Acid lime (the BurnerOS interaction color) ──────────
  acid: '#C5F000',
  /** Deep ink used for text rendered ON the acid button. */
  acidBtnInk: '#1C1919',

  // ── semantic ─────────────────────────────────────────────────────────────
  good: '#1F8A4C',
  goodSoft: 'rgba(31, 138, 76, 0.12)',
  goodStroke: 'rgba(31, 138, 76, 0.45)',
  danger: '#C23A2E',
  dangerSoft: 'rgba(194, 58, 46, 0.10)',
  dangerStroke: 'rgba(194, 58, 46, 0.50)',
  dangerText: '#9E2A20',

  // ── type families ─────────────────────────────────────────────────────────
  /** Monospaced terminal face for app UI labels, status, addresses. */
  mono: 'SF Mono',
  /** Geometric system sans for body copy + button labels. */
  sans: 'system-ui',
  /**
   * Editorial serif for the physical card's printed wordmark + phrase.
   * Resolves to New York on iOS — a high-contrast fashion-editorial serif,
   * which is what the physical Burner card uses.
   */
  serif: 'ui-serif',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Card variant system — the physical acrylic body colors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Burner card color variant. Each variant defines the saturated translucent
 * acrylic body tint + the matching trace/energized accent. Sampled from the
 * official card renders in assets/burner-cards/.
 *
 * `body` colors use rgba so the warm background shows through subtly — the card
 * must read as colored acrylic, not opaque plastic, and not invisible glass.
 */
export type CardVariant = {
  /** Variant key. */
  name: 'acid' | 'cherry' | 'galaxy' | 'jade' | 'mandarin' | 'sapphire';
  /** Display label. */
  label: string;
  /** Saturated translucent acrylic body fill (the dormant baseline). */
  body: string;
  /** Slightly brighter body when awake/energized. */
  bodyAwake: string;
  /** Edge highlight on the light-facing (top) edge. */
  edgeLight: string;
  /** Edge shadow on the opposite side. */
  edgeDark: string;
  /** Trace glow halo color. */
  traceGlow: string;
};

export const CARD_VARIANTS: Record<CardVariant['name'], CardVariant> = {
  // Acid — bright lime-yellow acrylic. The default.
  acid: {
    name: 'acid',
    label: 'Acid',
    body: 'rgba(197, 240, 0, 0.55)',
    bodyAwake: 'rgba(210, 248, 20, 0.66)',
    edgeLight: 'rgba(245, 255, 150, 0.85)',
    edgeDark: 'rgba(120, 150, 0, 0.40)',
    traceGlow: 'rgba(197, 240, 0, 0.55)',
  },
  cherry: {
    name: 'cherry',
    label: 'Cherry',
    body: 'rgba(214, 51, 108, 0.55)',
    bodyAwake: 'rgba(226, 70, 124, 0.66)',
    edgeLight: 'rgba(255, 180, 205, 0.85)',
    edgeDark: 'rgba(130, 25, 60, 0.40)',
    traceGlow: 'rgba(214, 51, 108, 0.55)',
  },
  galaxy: {
    name: 'galaxy',
    label: 'Galaxy',
    body: 'rgba(46, 74, 122, 0.55)',
    bodyAwake: 'rgba(60, 90, 140, 0.66)',
    edgeLight: 'rgba(180, 200, 240, 0.85)',
    edgeDark: 'rgba(20, 35, 65, 0.40)',
    traceGlow: 'rgba(70, 110, 170, 0.55)',
  },
  jade: {
    name: 'jade',
    label: 'Jade',
    body: 'rgba(13, 139, 111, 0.55)',
    bodyAwake: 'rgba(20, 158, 127, 0.66)',
    edgeLight: 'rgba(170, 235, 215, 0.85)',
    edgeDark: 'rgba(5, 75, 60, 0.40)',
    traceGlow: 'rgba(13, 139, 111, 0.55)',
  },
  mandarin: {
    name: 'mandarin',
    label: 'Mandarin',
    body: 'rgba(255, 107, 44, 0.55)',
    bodyAwake: 'rgba(255, 124, 66, 0.66)',
    edgeLight: 'rgba(255, 210, 175, 0.85)',
    edgeDark: 'rgba(150, 55, 15, 0.40)',
    traceGlow: 'rgba(255, 107, 44, 0.55)',
  },
  sapphire: {
    name: 'sapphire',
    label: 'Sapphire',
    body: 'rgba(26, 63, 160, 0.55)',
    bodyAwake: 'rgba(40, 80, 180, 0.66)',
    edgeLight: 'rgba(175, 200, 245, 0.85)',
    edgeDark: 'rgba(12, 30, 80, 0.40)',
    traceGlow: 'rgba(26, 63, 160, 0.55)',
  },
};

/** The default card variant for the experience. */
export const DEFAULT_VARIANT: CardVariant['name'] = 'acid';

// ─────────────────────────────────────────────────────────────────────────────
// Antenna wire — embedded INSIDE translucent acrylic, with a MILD copper tone.
// The wire is never seen directly: the coloured body sits between the viewer
// and the wire (a body-tinted front film is layered over the traces in
// BurnerCard to sell that embedding). The copper is deliberately dusty and
// low-alpha — a faint warm-orange cast, NOT bright/shiny metal — so the body
// tint still dominates and the wires read as cast quietly inside the slab.
// ─────────────────────────────────────────────────────────────────────────────
export const WIRE = {
  /** Dormant — a mild, muted copper (dusty copper-brown) at low opacity. Low
   *  alpha + the body-tinted front film push it to read as embedded, never as
   *  a bright surface wire. */
  dormant: 'rgba(106, 68, 38, 0.28)',
  /**
   * Deboss shadow — a darker warm-neutral laid ~0.25px INSIDE each trace (the
   * inner wall of the groove). With `debossLight` on the outer lip it sells the
   * antenna as recessed INTO the acrylic.
   */
  debossShadow: 'rgba(22, 14, 9, 0.22)',
  /**
   * Deboss refraction — an extremely faint warm highlight ~0.2px OUTSIDE each
   * trace (the outer lip of the etch catching light). Kept very dim so no edge
   * reads brighter than the rest of the wire, nor as metallic chrome.
   */
  debossLight: 'rgba(255, 220, 182, 0.08)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Opaque lower panel — light cream insert (per the official card)
// ─────────────────────────────────────────────────────────────────────────────

export const PANEL = {
  /** Warm off-white panel fill, sampled from the reference card. */
  fill: '#FBF7EC',
  /** Slightly deeper panel edge for definition against the body. */
  edge: 'rgba(28, 25, 25, 0.10)',
  /** Ink used for the pixel contactless mark printed on the panel. */
  ink: '#1C1919',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Spacing, radius
// ─────────────────────────────────────────────────────────────────────────────

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
  eight: 80,
} as const;

export const Radius = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 22,
  pill: 999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BurnerOS module framing — outlined panels with hard offset shadows
// ─────────────────────────────────────────────────────────────────────────────

export type ShadowSpec = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

/**
 * The signature BurnerOS hard offset shadow: a crisp near-black block offset
 * down-right behind the module. Used by outlined modules (the Connect button
 * is the one exception — it is glassmorphic, with a soft float shadow instead).
 * `size` scales the offset for different element sizes.
 *
 * The three specs depend only on the constant `Palette.ink` + fixed size
 * presets, so they are precomputed once at module load and `hardShadow` just
 * indexes into them. This keeps the returned object referentially stable
 * across renders instead of allocating a fresh spec on every call in JSX.
 */
const HARD_SHADOWS: Record<'sm' | 'md' | 'lg', ShadowSpec> = {
  sm: { shadowColor: Palette.ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 2 },
  md: { shadowColor: Palette.ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 5, height: 5 }, elevation: 3 },
  lg: { shadowColor: Palette.ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 7, height: 7 }, elevation: 4 },
};

export function hardShadow(size: 'sm' | 'md' | 'lg' = 'md'): ShadowSpec {
  return HARD_SHADOWS[size];
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion curves and durations
// ─────────────────────────────────────────────────────────────────────────────

export const Motion = {
  // durations (ms)
  fast: 240,
  base: 380,
  slow: 640,
  // ── connection-sequence phase timings ──
  /** Phase 3: success confirmation pause (400–700ms band). */
  confirmPause: 600,
  /** Phase 4: card rise + expansion (900–1,200ms band). Soft, confident settle. */
  rise: 1100,
  // ambient loop periods
  sweepMs: 5400,
  scanPulseMs: 2400,
  // spring configs
  springSnappy: { damping: 16, stiffness: 280, mass: 0.9 },
  /**
   * Connected hero rise — the single `reveal` driver. Decisive start, fluid
   * zero-bounce settle into the trophy position; overshoot clamped so there is
   * no elastic bounce. Tuned to feel like the card is lifted by a controlled
   * magnetic field.
   */
  springRise: { damping: 20, stiffness: 90, mass: 1, overshootClamping: true },
  /**
   * Error flinch — a brief mechanical rejection, not a playful shake. Fast damped
   * dip down, then a critically-damped recovery. No horizontal motion, no repeat.
   */
  springFlinchIn: { damping: 20, stiffness: 260, mass: 0.8, overshootClamping: true },
  springFlinchOut: { damping: 18, stiffness: 150, mass: 1, overshootClamping: true },
  // easing — soft, expressive curves for buttery transitions
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeRise: [0.16, 1, 0.3, 1] as const,
  /**
   * Explosive ease-out for the NFC field rings: accelerates outward quickly,
   * then appears to hang in the air while fading.
   */
  easeExplosive: [0.25, 1, 0.5, 1] as const,
} as const;
