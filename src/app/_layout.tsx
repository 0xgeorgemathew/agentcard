/**
 * Root layout. Single-screen app — no tabs. Light, warm BurnerOS theme.
 */
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Palette } from '@/constants/theme';
import { initNfc } from '@/nfc/readCard';

export default function RootLayout() {
  // Boot the NFC manager once on launch.
  useEffect(() => {
    initNfc().catch(() => {
      // surfaced in-UI when the user taps scan; ignore here
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Light canvas: dark ink on warm cream → dark status-bar content. */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </GestureHandlerRootView>
  );
}
