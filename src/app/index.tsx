/**
 * AgentCard — main screen.
 *
 * A single, continuous composition. The Burner card stays mounted across every
 * state; we never swap one screen for another. The card you see before
 * connection IS the card you see after connection — it powers on (traces
 * energize, body brightens, scales up) but never changes structure or identity.
 *
 * A central motion hook (`useConnectionMotion`) maps the NFC state machine into
 * shared progress values, and the card, button, and background lighting all
 * derive their styles from those values.
 *
 *   ┌─────────────────────────────┐
 *   │ Header (always)             │
 *   │                             │
 *   │        BurnerCard           │  ← always mounted; the SAME card in every
 *   │   (acrylic + traces + HaLo) │     state. Powers on when connected.
 *   │                             │
 *   │ Connect control             │  ← invite, fades out past scanning
 *   │   — or —                    │
 *   │ Wallet details (modules)    │  ← beneath the connected card
 *   └─────────────────────────────┘
 *
 * State machine (unchanged NFC semantics):
 *   disconnected → preparingToScan → scanning → reading → (success) → connected
 *                                                          ↘ error variants → disconnected
 *
 * NFC invariants preserved:
 *   - a reentrancy guard (`busy`) + attempt tokens so two scans never run
 *     concurrently and a stale callback can never mutate the current attempt,
 *   - `onTagDetected` is the only thing that flips scanning → reading,
 *   - `kind === 'cancelled'` is a silent return to disconnected,
 *   - the NFC session + SessionClosed listener are owned and torn down by the
 *     session owner (`src/nfc/nfcSession.ts`) — exactly once per attempt,
 *   - the success/error reveal awaits `outcome.dismissed` (the real
 *     SessionClosed lifecycle event) before any visible choreography — never
 *     an AppState guess or an arbitrary timeout.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

import { Palette, Spacing, Motion, Radius } from '@/constants/theme';
import { readCardAddress, type CardResult } from '@/nfc/readCard';
import { AddressBox } from '@/components/AddressBox';
import { AmbientLighting } from '@/components/AmbientLighting';
import { BurnerCard } from '@/components/BurnerCard';
import { ConnectControl } from '@/components/ConnectControl';
import { ErrorNotice, type ErrorKind } from '@/components/ErrorNotice';
import { GlassSurface } from '@/components/GlassSurface';
import { GrainOverlay } from '@/components/GrainOverlay';
import { useConnectionMotion, type AppState } from '@/motion/useConnectionMotion';

/**
 * Settling pause AFTER the native NFC sheet is confirmed dismissed. We never
 * gate the success reveal on this delay alone — it only adds a tiny breathing
 * beat once we already know the sheet is gone (via the real SessionClosed
 * lifecycle event), so the composition settles before the success reveal.
 */
const POST_DISMISS_SETTLE_MS = 120;

/**
 * Reserved height for the top bar slot. The slot holds BOTH the Header and the
 * ConnectedBar (cross-fading, each absoluteFilling the slot), so it must fit
 * the taller of the two — the ConnectedBar (top inset + its 32px close button +
 * a little shadow/headroom). Both bars apply their own `paddingTop: topInset`,
 * so this just needs to be ≥ the tallest bar's natural height.
 */
const TOP_BAR_RESERVED = 52;

export default function HomeScreen() {
  const [state, setState] = useState<AppState>('disconnected');
  const [result, setResult] = useState<CardResult | null>(null);
  const busy = useRef(false);

  // ── attempt identity (audit #10) ──
  // Monotonic token + unmount flag. Every async continuation in connect() checks
  // isCurrent() before mutating state, so a stale callback from a superseded or
  // unmounted attempt can never affect the current screen. The deterministic
  // sheet-dismissal signal lives in the session owner (`outcome.dismissed`),
  // so there is no AppState polling here.
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  // The single source of choreography. Every visual element reads from `m`.
  const m = useConnectionMotion(state);

  const errorKind: ErrorKind | null =
    state === 'timedOut' || state === 'unsupportedCard' || state === 'connectionFailed'
      ? state
      : null;

  /** Show an error variant, then auto-dismiss back to disconnected. */
  const showErrorState = useCallback((variant: 'timedOut' | 'unsupportedCard' | 'connectionFailed') => {
    const attempt = attemptRef.current;
    setState(variant);
    setTimeout(() => {
      // Only auto-clear if still the same attempt and still mounted.
      if (attemptRef.current === attempt && !unmountedRef.current) {
        setState((s) => (s === variant ? 'disconnected' : s));
      }
    }, 3800);
  }, []);

  /** Begin a connection attempt. Arms the pre-scan state, then opens NFC. */
  const connect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const attempt = ++attemptRef.current;
    // Guard every async continuation against a newer attempt or unmount.
    const isCurrent = () => attemptRef.current === attempt && !unmountedRef.current;

    setResult(null);

    // Phase 1: arm. A short, intentional transition before the OS sheet.
    setState('preparingToScan');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await delay(320);
    if (!isCurrent()) {
      busy.current = false;
      return;
    }

    // Phase 2: open the OS NFC sheet. readCardAddress owns the tag + session
    // lifecycle and returns an outcome paired with a deterministic `dismissed`
    // promise (SessionClosed). It never throws.
    setState('scanning');
    const outcome = await readCardAddress((tag) => {
      // Tag physically connected → reading. The only signal that the card
      // actually touched the phone.
      if (!isCurrent()) return;
      setState('reading');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    });

    // The native NFC sheet is dismissed deterministically via SessionClosed
    // (handled inside readCardAddress). Never reveal behind an open sheet.
    await outcome.dismissed;
    if (!isCurrent()) {
      busy.current = false;
      return;
    }

    if (outcome.ok) {
      // SUCCESS path — visible reveal now that the sheet is confirmed gone.
      setResult(outcome.result);
      await delay(POST_DISMISS_SETTLE_MS);
      if (!isCurrent()) {
        busy.current = false;
        return;
      }
      // Stage 1: success confirmation (success → 1).
      setState('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await delay(Motion.confirmPause);
      if (!isCurrent()) {
        busy.current = false;
        return;
      }
      // Stage 2: the card grows into its connected form (reveal → 0→1).
      setState('connected');
    } else {
      const { kind } = outcome.error;
      if (kind === 'cancelled') {
        // user backed out of the OS sheet — silent.
        setState('disconnected');
      } else if (kind === 'timedOut') {
        m.fireErrorPulse();
        showErrorState('timedOut');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (kind === 'unsupported-card' || kind === 'no-card') {
        m.fireErrorPulse();
        showErrorState('unsupportedCard');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        // not-supported, busy, read-failed → generic connection failure.
        m.fireErrorPulse();
        showErrorState('connectionFailed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(() => {
    setState('disconnected');
    setTimeout(() => {
      if (!unmountedRef.current) connect();
    }, 80);
  }, [connect]);

  const resetToDisconnected = useCallback(() => {
    // Invalidate any in-flight attempt so its stale callbacks can't mutate state.
    attemptRef.current += 1;
    setResult(null);
    setState('disconnected');
  }, []);

  const insets = useSafeAreaInsets();

  const armed = state === 'preparingToScan' || state === 'scanning' || state === 'reading';
  const pastInvite = state === 'reading' || state === 'success' || state === 'connected';
  const connected = state === 'connected';

  return (
    <SafeAreaView style={styles.safe}>
      {/* state-reactive background lighting */}
      <AmbientLighting
        energyWarm={m.energyWarm}
        energyCool={m.energyCool}
        scanActive={m.scanActive}
      />

      {/*
       * Static film grain — textures the cream canvas with a subtle physical
       * tooth. Sits ABOVE the ambient washes but BELOW the card + interactive UI
       * (the screen content layer renders on top of it). Static, never animated.
       */}
      <GrainOverlay />

      <View style={styles.screen}>
        {/*
         * The Burner card is always mounted: the SAME card in every state.
         * OUT OF FLOW (absoluteFill) so its vertical center never changes when
         * the bottom region swaps content. The card's position is 100% driven
         * by Reanimated transforms, never by document flow. pointerEvents none
         * so touches pass through to the header and bottom region below.
         */}
        <View style={styles.cardStage} pointerEvents="none">
          <BurnerCard
            scanActive={m.scanActive}
            reading={m.reading}
            success={m.success}
            settled={m.settled}
            reveal={m.reveal}
            fieldPulse={m.fieldPulse}
            errorPulse={m.errorPulse}
            phase={m.phase}
            dormancy={m.dormancy}
          />
        </View>

        {/*
         * Top bar — Header and ConnectedBar are BOTH mounted and cross-fade on
         * connect / disconnect. They share one fixed-height slot (each pane
         * absoluteFills it via the `overlay` prop) and opacity-fade instead of
         * hard-swapping through a ternary, which would pop one out and the other
         * in instantaneously. pointerEvents follows each pane's visibility, so
         * only the visible bar is interactive (notably the ConnectedBar's
         * disconnect pill).
         */}
        <View style={[styles.topBarSlot, { height: insets.top + TOP_BAR_RESERVED }]} pointerEvents="box-none">
          <FadeLayer visible={!connected || !result} overlay key="header">
            <Header topInset={insets.top} />
          </FadeLayer>
          <FadeLayer visible={connected && !!result} overlay key="connectedBar">
            <ConnectedBar onDisconnect={resetToDisconnected} topInset={insets.top} />
          </FadeLayer>
        </View>

        {/*
         * Bottom region renders ABOVE the card stage (later in tree = higher
         * z-order). The ConnectControl stays MOUNTED across the whole flow; only
         * its visibility fades. The old `{!pastInvite ? … : null}` ternary
         * unmounted the FadeLayer the instant pastInvite flipped, so the fade-out
         * never ran and the button vanished in one frame. Keeping it mounted lets
         * the FadeLayer ease the button out on reading and back in on disconnect.
         */}
        <View style={[styles.bottomRegion, { paddingBottom: insets.bottom + 20 }]}>
          <FadeLayer visible={!pastInvite} key="invite">
            <ConnectControl armed={armed} onPress={connect} />
          </FadeLayer>
        </View>

        {/*
         * Connected-state address panel — a glass readout of the card's address,
         * positioned absolutely JUST BELOW the card (which sits high in its hero
         * pose). Out of flow so it never disturbs the card stage or the bottom
         * CTA region; it cross-fades in on connect and out on disconnect. The
         * FadeLayer stays in flow inside this host so the host shrink-wraps to
         * the box height.
         */}
        <View style={[styles.connectedPanel, { bottom: insets.bottom + 34 }]} pointerEvents="box-none">
          <FadeLayer visible={connected && !!result} key="address">
            <AddressBox address={result?.address ?? ''} />
          </FadeLayer>
        </View>

        {/* ── Error notice ── */}
        <ErrorNotice
          kind={errorKind ?? 'connectionFailed'}
          visible={errorKind !== null}
          onRetry={retry}
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * A cross-fade layer. When not `visible`, fades + slides out and ignores
 * touches. When visible, fades + slides in.
 *
 * The layer NEVER collapses its layout while hidden — it only animates opacity
 * (+ an optional slide) and flips pointerEvents. A `height: 0` collapse on hide
 * would clip the content to nothing in one frame, defeating the fade and (for a
 * cross-fade) popping the leaving element out instantly. So a hidden layer keeps
 * reserving its slot; callers that need elements to stack and cross-fade pass
 * `overlay` (absoluteFills the parent so several can share one box).
 */
function FadeLayer({
  visible,
  children,
  overlay,
}: {
  visible: boolean;
  children: React.ReactNode;
  /** Absolute-fill the parent so multiple layers can stack and cross-fade in
   * the same slot (used by the top bar). Default leaves the layer in flow. */
  overlay?: boolean;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(visible ? 1 : 0);
  const ty = useSharedValue(visible ? 0 : 12);

  useEffect(() => {
    // Soft, slightly longer cross-fade so content swaps feel buttery and never
    // snap. easeOut bezier for a gentle deceleration into place.
    const easing = Easing.bezier(...Motion.easeOut);
    opacity.value = withTiming(visible ? 1 : 0, { duration: 360, easing });
    // Reduced Motion: keep the opacity cross-fade only — no spatial slide.
    ty.value = reduced ? 0 : withTiming(visible ? 0 : 12, { duration: 360, easing });
  }, [visible, reduced, opacity, ty]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.fadeLayer, overlay && styles.fadeOverlay, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Header — the brand header, shown in every non-connected phase. It cross-fades
 * out for the ConnectedBar when a card connects. It only ever renders its brand
 * appearance (the connected appearance is the ConnectedBar's job), so it takes
 * no `connected` flag — this also keeps its content stable while it fades out,
 * instead of flipping text mid-cross-fade.
 */
function Header({ topInset }: { topInset: number }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + Spacing.one }]}>
      <View style={[styles.brandDot, { backgroundColor: Palette.acid }]} />
      <Text style={styles.brand}>ARX · BURNER</Text>
    </View>
  );
}

/**
 * ConnectedBar — the connected-state top bar. A glassmorphic "Burner connected"
 * pill (built on GlassSurface) with a green status dot. The pill IS the
 * disconnect affordance: tapping it disconnects (there is no separate ✕ button
 * anymore). The pill is the one connected-state status indicator and the one
 * disconnect control, so its tap target is generously the whole pill.
 */
function ConnectedBar({
  onDisconnect,
  topInset,
}: {
  onDisconnect: () => void;
  topInset: number;
}) {
  return (
    <View style={[styles.connectedBar, { paddingTop: topInset + Spacing.one }]}>
      <Pressable
        onPress={onDisconnect}
        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        accessibilityRole="button"
        accessibilityLabel="Burner connected. Double tap to disconnect."
        accessibilityHint="Disconnects so you can scan a different card."
        style={({ pressed }) => pressed && styles.connectedPressed}
      >
        {/*
         * Shrink-wrap glass pill (no fixed width) so it hugs "● Burner connected"
         * exactly. contentContainerStyle lays the dot + label out as a padded row.
         */}
        <GlassSurface
          radius={Radius.pill}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <View style={styles.connectedDot} />
          <Text style={styles.connectedText}>Burner connected</Text>
        </GlassSurface>
      </Pressable>
    </View>
  );
}

/** Promise-based delay for the arming beat. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Palette.bg,
  },
  screen: {
    flex: 1,
    position: 'relative',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.four,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  brand: {
    color: Palette.muted,
    fontFamily: Palette.mono,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  cardStage: {
    // OUT OF FLOW. Absolutely positioned filling the screen so the card's
    // vertical center NEVER changes when the bottom region swaps content.
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRegion: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Top bar slot — fixed-height box holding the cross-fading Header and
  // ConnectedBar panes (each absoluteFills it). In flow so it anchors the top
  // of the screen; the card stage is absolute and the bottom region is flex-end,
  // so neither is affected by this reserved height. Height is set inline from
  // the safe-area top inset + TOP_BAR_RESERVED.
  topBarSlot: {
    width: '100%',
  },
  fadeLayer: {
    alignItems: 'center',
    width: '100%',
  },
  // Overlay variant — absoluteFills the parent so several FadeLayers can stack
  // and cross-fade in one slot (the top bar). Non-overlay layers stay in flow
  // and simply reserve their slot while faded out.
  fadeOverlay: {
    ...StyleSheet.absoluteFill,
  },
  // ConnectedBar host — full-width row holding the single glass disconnect pill
  // (left-aligned, matching the brand Header's position).
  connectedBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  // Press feedback for the pill (the whole pill is the tap target).
  connectedPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  // Green status dot inside the glass pill — the single colour cue for the
  // connected/success state (paired with the "Burner connected" text, so status
  // is never communicated by colour alone).
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Palette.good,
  },
  connectedText: {
    color: Palette.ink,
    fontFamily: Palette.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  // Connected-state address panel — absolutely positioned below the card.
  connectedPanel: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
  },
});
